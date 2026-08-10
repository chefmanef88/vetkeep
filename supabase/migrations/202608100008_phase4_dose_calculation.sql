-- Phase 4: dose rate, strength, and the volume that falls out of them.
--
-- A vet works this out in their head all day: rate times weight gives the
-- amount of drug, divided by the strength of the bottle gives the volume in the
-- syringe. It is simple arithmetic and it is also where a decimal point goes
-- missing at the end of a long day.
--
-- The volume is still stored in dose_value, because that is what was actually
-- given and what a client's copy must show. What is added is the reasoning
-- behind it: the rate, the weight it was applied to, and the strength of the
-- product. A record that says "1.5 ml" cannot be checked; one that says
-- "20 mg/kg at 15 kg from a 200 mg/ml bottle" can.

-- ---------------------------------------------------------------------------
-- Strength on a product
-- ---------------------------------------------------------------------------

alter table public.inventory_items
  add column if not exists concentration_value numeric(10,3),
  add column if not exists concentration_unit text;

alter table public.inventory_items
  drop constraint if exists inventory_items_concentration_value_check,
  drop constraint if exists inventory_items_concentration_unit_check,
  drop constraint if exists inventory_items_concentration_pair_check;

alter table public.inventory_items
  add constraint inventory_items_concentration_value_check
    check (concentration_value is null or concentration_value > 0),
  add constraint inventory_items_concentration_unit_check
    check (concentration_unit is null or concentration_unit in (
      'mg_per_ml', 'percent', 'iu_per_ml', 'mg_per_g'
    )),
  -- A number without its unit is not a strength, and a unit without a number
  -- describes nothing. Either both or neither.
  add constraint inventory_items_concentration_pair_check
    check (
      (concentration_value is null and concentration_unit is null)
      or (concentration_value is not null and concentration_unit is not null)
    );

comment on column public.inventory_items.concentration_unit is
  'A percentage is w/v: 20% means 20 g per 100 ml, which is 200 mg/ml.';

-- ---------------------------------------------------------------------------
-- The reasoning behind a dose
-- ---------------------------------------------------------------------------

alter table public.treatments
  add column if not exists dose_rate_value numeric(10,3),
  add column if not exists dose_rate_unit text,
  -- Always kilograms, whatever the folder records. A bird weighed in grams is
  -- converted before it reaches here, so two records are never in two units.
  add column if not exists weight_kg_used numeric(8,3),
  add column if not exists concentration_value numeric(10,3),
  add column if not exists concentration_unit text;

alter table public.treatments
  drop constraint if exists treatments_dose_rate_unit_check,
  drop constraint if exists treatments_dose_rate_value_check,
  drop constraint if exists treatments_weight_used_check,
  drop constraint if exists treatments_concentration_unit_check;

alter table public.treatments
  add constraint treatments_dose_rate_unit_check
    check (dose_rate_unit is null or dose_rate_unit in ('mg_per_kg', 'ml_per_kg', 'iu_per_kg')),
  add constraint treatments_dose_rate_value_check
    check (dose_rate_value is null or dose_rate_value > 0),
  add constraint treatments_weight_used_check
    check (weight_kg_used is null or weight_kg_used > 0),
  add constraint treatments_concentration_unit_check
    check (concentration_unit is null or concentration_unit in (
      'mg_per_ml', 'percent', 'iu_per_ml', 'mg_per_g'
    ));

-- ---------------------------------------------------------------------------
-- Products, with strength
-- ---------------------------------------------------------------------------

drop function if exists public.upsert_product(
  uuid, text, text, text, text, text, integer, integer, integer, boolean, uuid
);

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
  p_concentration_value numeric default null,
  p_concentration_unit text default null,
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

  if coalesce(p_withdrawal_meat_days, 0) < 0
     or coalesce(p_withdrawal_milk_days, 0) < 0
     or coalesce(p_withdrawal_eggs_days, 0) < 0 then
    raise exception 'A withholding period cannot be negative' using errcode = '22023';
  end if;

  -- A strength is a number and a unit together. Half of one would silently
  -- compute nothing, or compute against the wrong scale.
  if (p_concentration_value is null) <> (p_concentration_unit is null) then
    raise exception 'A strength needs both a number and a unit' using errcode = '22023';
  end if;

  if p_concentration_value is not null and p_concentration_value <= 0 then
    raise exception 'A strength must be greater than zero' using errcode = '22023';
  end if;

  if p_concentration_unit is not null and p_concentration_unit not in (
    'mg_per_ml', 'percent', 'iu_per_ml', 'mg_per_g'
  ) then
    raise exception 'Invalid strength unit' using errcode = '22023';
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
    concentration_value, concentration_unit,
    created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, trim(p_item_name), p_item_type, trim(p_unit), coalesce(p_active, true),
    nullif(trim(p_active_ingredient), ''), p_default_route,
    p_withdrawal_meat_days, p_withdrawal_milk_days, p_withdrawal_eggs_days,
    p_concentration_value, p_concentration_unit,
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
      concentration_value = excluded.concentration_value,
      concentration_unit = excluded.concentration_unit,
      last_modified_by_device_id = coalesce(excluded.last_modified_by_device_id, public.inventory_items.last_modified_by_device_id)
  where public.inventory_items.vet_id = v_vet_id;

  perform app_private.insert_audit_event(
    v_vet_id, 'product.saved', 'inventory_item', p_id, null,
    jsonb_build_object('name', trim(p_item_name), 'type', p_item_type)
  );

  return p_id;
end;
$$;

grant execute on function public.upsert_product(
  uuid, text, text, text, text, text, integer, integer, integer, numeric, text, boolean, uuid
) to authenticated;
revoke execute on function public.upsert_product(
  uuid, text, text, text, text, text, integer, integer, integer, numeric, text, boolean, uuid
) from public, anon;

-- ---------------------------------------------------------------------------
-- Treatments, carrying their working
-- ---------------------------------------------------------------------------

drop function if exists public.record_treatment(
  uuid, uuid, text, numeric, text, text, timestamptz, uuid, text, integer, integer,
  date, date, date, text, text, uuid
);

create or replace function public.record_treatment(
  p_id uuid,
  p_visit_id uuid,
  p_product_name text,
  p_dose_value numeric,
  p_dose_unit text,
  p_route text,
  p_administered_at timestamptz default null,
  p_inventory_item_id uuid default null,
  p_active_ingredient text default null,
  p_duration_days integer default null,
  p_animals_treated integer default null,
  p_meat_withhold_until date default null,
  p_milk_withhold_until date default null,
  p_eggs_withhold_until date default null,
  p_withdrawal_source text default 'formulary',
  p_notes text default null,
  p_device_id uuid default null,
  -- How the volume was arrived at, kept so the record can be checked later.
  p_dose_rate_value numeric default null,
  p_dose_rate_unit text default null,
  p_weight_kg_used numeric default null,
  p_concentration_value numeric default null,
  p_concentration_unit text default null
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

  if v_visit_status <> 'draft' then
    raise exception 'This record is signed and can no longer be added to' using errcode = '22023';
  end if;

  if p_withdrawal_source not in ('formulary', 'manual', 'none_required') then
    raise exception 'Invalid withdrawal source' using errcode = '22023';
  end if;

  if p_dose_rate_unit is not null and p_dose_rate_unit not in (
    'mg_per_kg', 'ml_per_kg', 'iu_per_kg'
  ) then
    raise exception 'Invalid dose rate unit' using errcode = '22023';
  end if;

  -- A rate without the weight it was applied to cannot be rechecked, which is
  -- the only reason for storing it.
  if p_dose_rate_value is not null and p_weight_kg_used is null then
    raise exception 'A dose rate needs the weight it was worked out from' using errcode = '22023';
  end if;

  select species, purpose into v_species, v_purpose
  from public.patients
  where id = v_patient_id and vet_id = v_vet_id;

  v_administered := coalesce(p_administered_at, now());
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
    dose_rate_value, dose_rate_unit, weight_kg_used,
    concentration_value, concentration_unit,
    meat_withhold_until, milk_withhold_until, eggs_withhold_until, withdrawal_source,
    notes, created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, p_visit_id, v_patient_id,
    p_inventory_item_id, trim(p_product_name),
    nullif(trim(p_active_ingredient), ''),
    p_dose_value, trim(p_dose_unit), p_route, v_administered, p_duration_days, p_animals_treated,
    p_dose_rate_value, p_dose_rate_unit, p_weight_kg_used,
    p_concentration_value, p_concentration_unit,
    v_meat, v_milk, v_eggs, p_withdrawal_source,
    nullif(trim(p_notes), ''), p_device_id, p_device_id
  )
  on conflict (id) do nothing;

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
  date, date, date, text, text, uuid, numeric, text, numeric, numeric, text
) to authenticated;
revoke execute on function public.record_treatment(
  uuid, uuid, text, numeric, text, text, timestamptz, uuid, text, integer, integer,
  date, date, date, text, text, uuid, numeric, text, numeric, numeric, text
) from public, anon;
