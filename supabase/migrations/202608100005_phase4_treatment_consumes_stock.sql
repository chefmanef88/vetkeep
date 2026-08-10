-- Phase 4: giving a drug is one act, not two.
--
-- Recording a treatment and recording that stock left the vehicle were separate
-- forms on the same screen, so one injection had to be entered twice. They are
-- two meanings of a single act: the treatment answers "what did this animal
-- receive and when is the food safe", the movement answers "what left my
-- vehicle, from which lot, and do I need more".
--
-- record_treatment now performs both in one transaction by calling the existing
-- record_inventory_consumption rather than repeating its arithmetic. That
-- function already locks the batch, refuses to over-draw it, and is idempotent
-- on the movement id, so a retried sync deducts once. Reimplementing any of that
-- here would be a second place for it to be wrong.
--
-- The quantity is stated, never inferred from the dose. A dose of "1 g/L in
-- water" and a stock unit of "ml" are not the same measure, and guessing would
-- silently corrupt the count of what the vet is carrying.

create or replace function public.record_treatment(
  p_id uuid,
  p_visit_id uuid,
  p_product_name text,
  p_dose_value numeric,
  p_dose_unit text,
  p_route text,
  p_administered_at timestamptz default null,
  p_inventory_item_id uuid default null,
  p_inventory_batch_id uuid default null,
  p_active_ingredient text default null,
  p_duration_days integer default null,
  p_animals_treated integer default null,
  p_meat_withhold_until date default null,
  p_milk_withhold_until date default null,
  p_eggs_withhold_until date default null,
  p_withdrawal_source text default 'formulary',
  p_notes text default null,
  p_device_id uuid default null,
  -- Supplied together when the product came out of carried stock.
  p_movement_id uuid default null,
  p_quantity_used numeric default null
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

  -- Deducting stock needs an id the caller minted, so a retried sync draws the
  -- batch down once rather than once per attempt.
  if p_quantity_used is not null and p_movement_id is null then
    raise exception 'Taking stock needs a movement id' using errcode = '22023';
  end if;

  if p_quantity_used is not null and p_inventory_batch_id is null then
    raise exception 'Say which batch the stock came from' using errcode = '22023';
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
    inventory_item_id, inventory_batch_id, product_name, active_ingredient,
    dose_value, dose_unit, route, administered_at, duration_days, animals_treated,
    meat_withhold_until, milk_withhold_until, eggs_withhold_until, withdrawal_source,
    notes, created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, p_visit_id, v_patient_id,
    p_inventory_item_id, p_inventory_batch_id, trim(p_product_name),
    nullif(trim(p_active_ingredient), ''),
    p_dose_value, trim(p_dose_unit), p_route, v_administered, p_duration_days, p_animals_treated,
    v_meat, v_milk, v_eggs, p_withdrawal_source,
    nullif(trim(p_notes), ''), p_device_id, p_device_id
  )
  on conflict (id) do nothing;

  -- Idempotent under a retried sync. Returning here also means the stock below
  -- is not drawn down a second time.
  if not found then
    if exists (select 1 from public.treatments where id = p_id and vet_id = v_vet_id) then
      return p_id;
    end if;
    raise exception 'Treatment ID is unavailable' using errcode = '42501';
  end if;

  -- One transaction with the treatment. If the batch cannot cover it, the whole
  -- thing rolls back rather than leaving a treatment recorded against stock the
  -- vet did not have.
  if p_quantity_used is not null then
    perform public.record_inventory_consumption(
      p_movement_id,
      p_inventory_batch_id,
      p_visit_id,
      p_quantity_used,
      'Given as ' || trim(p_product_name),
      p_device_id
    );
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'treatment.recorded', 'treatment', p_id, null,
    jsonb_build_object(
      'visit_id', p_visit_id,
      'patient_id', v_patient_id,
      'product', trim(p_product_name),
      'withdrawal_source', p_withdrawal_source,
      'batch_id', p_inventory_batch_id,
      'quantity_used', p_quantity_used
    )
  );

  return p_id;
end;
$$;

grant execute on function public.record_treatment(
  uuid, uuid, text, numeric, text, text, timestamptz, uuid, uuid, text, integer, integer,
  date, date, date, text, text, uuid, uuid, numeric
) to authenticated;
revoke execute on function public.record_treatment(
  uuid, uuid, text, numeric, text, text, timestamptz, uuid, uuid, text, integer, integer,
  date, date, date, text, text, uuid, uuid, numeric
) from public, anon;

-- The previous signature would otherwise remain callable and silently skip the
-- stock deduction.
drop function if exists public.record_treatment(
  uuid, uuid, text, numeric, text, text, timestamptz, uuid, uuid, text, integer, integer,
  date, date, date, text, text, uuid
);
