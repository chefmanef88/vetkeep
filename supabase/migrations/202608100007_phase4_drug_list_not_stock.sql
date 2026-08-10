-- Phase 4: a drug list, not a stock count.
--
-- Receiving stock was specified as a web-app job because lot numbers and expiry
-- dates are fiddly to type on a phone (brief §7.8). That reasoning does not
-- survive how this vet actually works: the phone is the only device, so the
-- stock screen could only ever say "nothing recorded yet". A feature that cannot
-- be populated from the device it is used on is not a feature.
--
-- What is worth keeping is the other half of inventory_items: the formulary.
-- Recording that a product carries a twenty-eight day meat withholding is what
-- lets a treatment compute its own dates, and that is the one thing here with a
-- food-safety consequence. So the list of products stays and the counting goes.
--
-- record_treatment no longer draws a batch down. The batch and movement tables
-- are left in place rather than dropped: nothing writes to them from the
-- application now, and removing tables that clinical rows still reference is a
-- destructive change that buys nothing.

drop function if exists public.record_treatment(
  uuid, uuid, text, numeric, text, text, timestamptz, uuid, uuid, text, integer, integer,
  date, date, date, text, text, uuid, uuid, numeric
);

create or replace function public.record_treatment(
  p_id uuid,
  p_visit_id uuid,
  p_product_name text,
  p_dose_value numeric,
  p_dose_unit text,
  p_route text,
  p_administered_at timestamptz default null,
  -- Kept: this is how the formulary resolves the withholding dates.
  p_inventory_item_id uuid default null,
  p_active_ingredient text default null,
  p_duration_days integer default null,
  p_animals_treated integer default null,
  p_meat_withhold_until date default null,
  p_milk_withhold_until date default null,
  p_eggs_withhold_until date default null,
  p_withdrawal_source text default 'formulary',
  p_notes text default null,
  p_device_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_patient_id uuid;
  v_visit_status text;
  v_species text;
  v_purpose text;
  v_required text[];
  v_administered timestamptz;
  v_last_day date;
  v_meat date := p_meat_withhold_until;
  v_milk date := p_milk_withhold_until;
  v_eggs date := p_eggs_withhold_until;
  v_item_meat integer;
  v_item_milk integer;
  v_item_eggs integer;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  select patient_id, workflow_status
  into v_patient_id, v_visit_status
  from public.visits
  where id = p_visit_id and vet_id = v_vet_id and deleted_at is null;

  if v_patient_id is null then
    raise exception 'Record not found' using errcode = 'P0002';
  end if;

  -- A signed record is closed. A treatment given afterwards belongs to a new
  -- record or an amendment, not appended to a document already handed over.
  if v_visit_status <> 'draft' then
    raise exception 'This record is signed and can no longer be added to' using errcode = '22023';
  end if;

  if p_withdrawal_source not in ('formulary', 'manual', 'none_required') then
    raise exception 'Invalid withdrawal source' using errcode = '22023';
  end if;

  select species, purpose into v_species, v_purpose
  from public.patients
  where id = v_patient_id and vet_id = v_vet_id;

  v_administered := coalesce(p_administered_at, now());
  -- Withholding runs from the LAST day the product was given, not the first.
  v_last_day := (v_administered at time zone 'UTC')::date
                + coalesce(p_duration_days, 1) - 1;

  if p_withdrawal_source = 'formulary' and p_inventory_item_id is not null then
    select withdrawal_meat_days, withdrawal_milk_days, withdrawal_eggs_days
    into v_item_meat, v_item_milk, v_item_eggs
    from public.inventory_items
    where id = p_inventory_item_id and vet_id = v_vet_id and deleted_at is null;

    if v_meat is null and v_item_meat is not null then v_meat := v_last_day + v_item_meat; end if;
    if v_milk is null and v_item_milk is not null then v_milk := v_last_day + v_item_milk; end if;
    if v_eggs is null and v_item_eggs is not null then v_eggs := v_last_day + v_item_eggs; end if;
  end if;

  -- The rule this table exists for. An animal destined for the food chain owes
  -- every withholding period its species carries, and the only way to owe none
  -- is to say so deliberately.
  v_required := app_private.required_withdrawals(v_species, v_purpose);

  if p_withdrawal_source <> 'none_required' and array_length(v_required, 1) is not null then
    declare
      v_missing text[] := array[]::text[];
    begin
      if 'meat' = any (v_required) and v_meat is null then
        v_missing := array_append(v_missing, 'meat');
      end if;
      if 'milk' = any (v_required) and v_milk is null then
        v_missing := array_append(v_missing, 'milk');
      end if;
      if 'eggs' = any (v_required) and v_eggs is null then
        v_missing := array_append(v_missing, 'eggs');
      end if;

      if array_length(v_missing, 1) is not null then
        raise exception 'This animal needs a % withholding period',
          array_to_string(v_missing, ' and a ')
          using errcode = '22023';
      end if;
    end;
  end if;

  insert into public.treatments (
    id, vet_id, visit_id, patient_id,
    inventory_item_id, product_name, active_ingredient,
    dose_value, dose_unit, route, administered_at, duration_days, animals_treated,
    meat_withhold_until, milk_withhold_until, eggs_withhold_until, withdrawal_source,
    notes, created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, p_visit_id, v_patient_id,
    p_inventory_item_id, trim(p_product_name),
    nullif(trim(p_active_ingredient), ''),
    p_dose_value, trim(p_dose_unit), p_route, v_administered, p_duration_days, p_animals_treated,
    v_meat, v_milk, v_eggs, p_withdrawal_source,
    nullif(trim(p_notes), ''), p_device_id, p_device_id
  )
  on conflict (id) do nothing;

  -- Idempotent under a retried sync, like every other create in this schema.
  if not found then
    if exists (select 1 from public.treatments where id = p_id and vet_id = v_vet_id) then
      return p_id;
    end if;
    raise exception 'Treatment ID is unavailable' using errcode = '42501';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'treatment.recorded', 'treatment', p_id, null,
    jsonb_build_object(
      'visit_id', p_visit_id,
      'patient_id', v_patient_id,
      'product', trim(p_product_name),
      'withdrawal_source', p_withdrawal_source
    )
  );

  return p_id;
end;
$$;

grant execute on function public.record_treatment(
  uuid, uuid, text, numeric, text, text, timestamptz, uuid, text, integer, integer,
  date, date, date, text, text, uuid
) to authenticated;
revoke execute on function public.record_treatment(
  uuid, uuid, text, numeric, text, text, timestamptz, uuid, text, integer, integer,
  date, date, date, text, text, uuid
) from public, anon;

-- ---------------------------------------------------------------------------
-- Products, without a count
-- ---------------------------------------------------------------------------

-- A product is added from the phone as it is first used. There is no quantity,
-- no batch and no expiry: the list exists to hold what a product is and what it
-- obliges, not how much of it is in the bag.
create or replace function public.upsert_product(
  p_id uuid,
  p_item_name text,
  p_item_type text,
  p_unit text,
  p_active_ingredient text default null,
  p_default_route text default null,
  p_withdrawal_meat_days integer default null,
  p_withdrawal_milk_days integer default null,
  p_withdrawal_eggs_days integer default null,
  p_active boolean default true,
  p_device_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  if char_length(trim(coalesce(p_item_name, ''))) not between 1 and 160 then
    raise exception 'Name the product' using errcode = '22023';
  end if;

  if p_item_type is null or p_item_type not in ('drug', 'consumable', 'vaccine', 'other') then
    raise exception 'Invalid product type' using errcode = '22023';
  end if;

  if char_length(trim(coalesce(p_unit, ''))) not between 1 and 40 then
    raise exception 'Give the unit it is measured in' using errcode = '22023';
  end if;

  if p_default_route is not null and p_default_route not in (
    'oral', 'im', 'iv', 'sc', 'topical', 'intramammary', 'in_water', 'in_feed'
  ) then
    raise exception 'Invalid route' using errcode = '22023';
  end if;

  -- A negative period would compute a withholding date in the past, which reads
  -- as "safe already" for a product that is not.
  if coalesce(p_withdrawal_meat_days, 0) < 0
     or coalesce(p_withdrawal_milk_days, 0) < 0
     or coalesce(p_withdrawal_eggs_days, 0) < 0 then
    raise exception 'A withholding period cannot be negative' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.inventory_items
    where vet_id = v_vet_id and item_name = trim(p_item_name) and id <> p_id and deleted_at is null
  ) then
    raise exception 'A product with this name already exists' using errcode = '22023';
  end if;

  insert into public.inventory_items (
    id, vet_id, item_name, item_type, unit, active,
    active_ingredient, default_route,
    withdrawal_meat_days, withdrawal_milk_days, withdrawal_eggs_days,
    created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, trim(p_item_name), p_item_type, trim(p_unit), coalesce(p_active, true),
    nullif(trim(p_active_ingredient), ''), p_default_route,
    p_withdrawal_meat_days, p_withdrawal_milk_days, p_withdrawal_eggs_days,
    p_device_id, p_device_id
  )
  on conflict (id) do update
  set item_name = excluded.item_name,
      item_type = excluded.item_type,
      unit = excluded.unit,
      active = excluded.active,
      active_ingredient = excluded.active_ingredient,
      default_route = excluded.default_route,
      withdrawal_meat_days = excluded.withdrawal_meat_days,
      withdrawal_milk_days = excluded.withdrawal_milk_days,
      withdrawal_eggs_days = excluded.withdrawal_eggs_days,
      last_modified_by_device_id = coalesce(excluded.last_modified_by_device_id, public.inventory_items.last_modified_by_device_id)
  where public.inventory_items.vet_id = v_vet_id;

  perform app_private.insert_audit_event(
    v_vet_id, 'product.saved', 'inventory_item', p_id, null,
    jsonb_build_object('name', trim(p_item_name), 'type', p_item_type)
  );

  return p_id;
end;
$$;

create or replace function public.delete_product(
  p_id uuid,
  p_reason text,
  p_device_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  -- Soft delete. Treatments already given still point at this row, and a
  -- clinical record must not lose the name of what was administered.
  update public.inventory_items
  set deleted_at = now(),
      active = false,
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_id and vet_id = v_vet_id and deleted_at is null;

  if not found then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'product.deleted', 'inventory_item', p_id, trim(p_reason), '{}'::jsonb
  );
end;
$$;

grant execute on function public.upsert_product(
  uuid, text, text, text, text, text, integer, integer, integer, boolean, uuid
) to authenticated;
grant execute on function public.delete_product(uuid, text, uuid) to authenticated;

revoke execute on function public.upsert_product(
  uuid, text, text, text, text, text, integer, integer, integer, boolean, uuid
) from public, anon;
revoke execute on function public.delete_product(uuid, text, uuid) from public, anon;
