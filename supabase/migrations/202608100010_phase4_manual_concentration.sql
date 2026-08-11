-- Phase 4: the strength off the bottle in your hand (brief §7.10).
--
-- The dose calculator sourced its concentration from the drug list alone. A vet
-- holding a bottle that is not on the list, or one that is on the list but was
-- entered without its strength, got "Not on file" and no arithmetic — at exactly
-- the moment the arithmetic is most wanted, because an unfamiliar product is
-- where a decimal point is most likely to go missing.
--
-- The calculation itself never needed the drug list: it needs a number and a
-- unit. What the drug list gave it was provenance, and that is worth keeping
-- rather than discarding. So a strength may now be typed, and the record says
-- which of the two it was — the same distinction withdrawal_source already draws
-- between a period read off the formulary and one a vet asserted.

-- ---------------------------------------------------------------------------
-- Where the strength came from
-- ---------------------------------------------------------------------------

alter table public.treatments
  add column if not exists concentration_source text;

alter table public.treatments
  drop constraint if exists treatments_concentration_source_check,
  drop constraint if exists treatments_concentration_source_pair_check;

alter table public.treatments
  add constraint treatments_concentration_source_check
    check (concentration_source is null or concentration_source in ('formulary', 'manual')),
  -- A strength with no stated origin is the thing this column exists to prevent.
  add constraint treatments_concentration_source_pair_check
    check (
      (concentration_value is null and concentration_source is null)
      or (concentration_value is not null and concentration_source is not null)
    );

comment on column public.treatments.concentration_source is
  'formulary: read from the drug list. manual: typed off the bottle at the visit. '
  'A dose worked out from a manual strength cannot be re-derived if the product is '
  'later added to the list, so the two are not interchangeable.';

-- ---------------------------------------------------------------------------
-- Recording it
-- ---------------------------------------------------------------------------

-- A new parameter overloads rather than replaces, and two record_treatments
-- would leave PostgREST free to resolve a named call to either. The old
-- signature goes first.
drop function if exists public.record_treatment(
  uuid, uuid, text, numeric, text, text, timestamptz, uuid, text, integer, integer,
  date, date, date, text, text, uuid, numeric, text, numeric, numeric, text
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
  p_concentration_unit text default null,
  p_concentration_source text default null
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
  v_source text := p_concentration_source;
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

  if v_source is not null and v_source not in ('formulary', 'manual') then
    raise exception 'Invalid concentration source' using errcode = '22023';
  end if;

  -- Callers that predate this column still send a strength and no source. The
  -- honest default is the stricter of the two: a strength whose origin was never
  -- stated is not evidence that the drug list vouched for it.
  if p_concentration_value is not null and v_source is null then
    v_source := 'manual';
  end if;

  if p_concentration_value is null and v_source is not null then
    raise exception 'A concentration source needs a concentration' using errcode = '22023';
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
    concentration_value, concentration_unit, concentration_source,
    meat_withhold_until, milk_withhold_until, eggs_withhold_until, withdrawal_source,
    notes, created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, p_visit_id, v_patient_id,
    p_inventory_item_id, trim(p_product_name),
    nullif(trim(p_active_ingredient), ''),
    p_dose_value, trim(p_dose_unit), p_route, v_administered, p_duration_days, p_animals_treated,
    p_dose_rate_value, p_dose_rate_unit, p_weight_kg_used,
    p_concentration_value, p_concentration_unit, v_source,
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
      'withdrawal_source', p_withdrawal_source,
      'concentration_source', v_source
    )
  );

  return p_id;
end;
$$;

revoke all on function public.record_treatment(
  uuid, uuid, text, numeric, text, text, timestamptz, uuid, text, integer, integer,
  date, date, date, text, text, uuid, numeric, text, numeric, numeric, text, text
) from public, anon;
grant execute on function public.record_treatment(
  uuid, uuid, text, numeric, text, text, timestamptz, uuid, text, integer, integer,
  date, date, date, text, text, uuid, numeric, text, numeric, numeric, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Keeping a strength that had to be typed
-- ---------------------------------------------------------------------------

-- Typing the strength of a carried product every visit is how it stays untyped.
-- This fills the gap in the drug list from the visit that exposed it, and only
-- where there is a gap: a strength already on file is not overwritten from a
-- consultation screen, because correcting the formulary is a deliberate act that
-- belongs on the products screen.
create or replace function public.set_item_concentration(
  p_item_id uuid,
  p_concentration_value numeric,
  p_concentration_unit text,
  p_device_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_existing numeric;
  v_name text;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  if p_concentration_value is null or p_concentration_value <= 0 then
    raise exception 'Enter the strength of the product' using errcode = '22023';
  end if;

  if p_concentration_unit is null or p_concentration_unit not in (
    'mg_per_ml', 'percent', 'iu_per_ml', 'mg_per_g'
  ) then
    raise exception 'Invalid concentration unit' using errcode = '22023';
  end if;

  select concentration_value, item_name into v_existing, v_name
  from public.inventory_items
  where id = p_item_id and vet_id = v_vet_id and deleted_at is null;

  if v_name is null then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;

  if v_existing is not null then
    raise exception 'This product already has a strength on file. Change it on the products screen'
      using errcode = '42501';
  end if;

  update public.inventory_items
  set concentration_value = p_concentration_value,
      concentration_unit = p_concentration_unit,
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_item_id and vet_id = v_vet_id and deleted_at is null;

  perform app_private.insert_audit_event(
    v_vet_id, 'inventory_item.concentration_set', 'inventory_item', p_item_id, null,
    jsonb_build_object(
      'item_name', v_name,
      'concentration_value', p_concentration_value,
      'concentration_unit', p_concentration_unit
    )
  );
end;
$$;

revoke all on function public.set_item_concentration(uuid, numeric, text, uuid) from public, anon;
grant execute on function public.set_item_concentration(uuid, numeric, text, uuid) to authenticated;
