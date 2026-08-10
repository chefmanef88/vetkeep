-- Phase 4: treatments and withdrawal periods (brief §7.10).
--
-- Free text cannot answer the question a farmer actually asks: when is the milk
-- safe? `treatment_plan` and `prescriptions` are prose, and nothing can read
-- them. A treatment therefore becomes a row, and the withholding dates become
-- dates.
--
-- The formulary is the field inventory extended rather than a second drug list.
-- What the veterinarian carries is what the veterinarian can administer, so
-- giving a product deducts the batch, records the lot against the animal, and
-- resolves the withholding dates in one action instead of three.

-- ---------------------------------------------------------------------------
-- The formulary
-- ---------------------------------------------------------------------------

alter table public.inventory_items
  add column if not exists active_ingredient text,
  add column if not exists default_route text,
  add column if not exists withdrawal_meat_days integer,
  add column if not exists withdrawal_milk_days integer,
  add column if not exists withdrawal_eggs_days integer;

alter table public.inventory_items
  drop constraint if exists inventory_items_default_route_check,
  drop constraint if exists inventory_items_withdrawal_meat_check,
  drop constraint if exists inventory_items_withdrawal_milk_check,
  drop constraint if exists inventory_items_withdrawal_eggs_check;

alter table public.inventory_items
  add constraint inventory_items_default_route_check
    check (default_route is null or default_route in (
      'oral', 'im', 'iv', 'sc', 'topical', 'intramammary', 'in_water', 'in_feed'
    )),
  add constraint inventory_items_withdrawal_meat_check
    check (withdrawal_meat_days is null or withdrawal_meat_days >= 0),
  add constraint inventory_items_withdrawal_milk_check
    check (withdrawal_milk_days is null or withdrawal_milk_days >= 0),
  add constraint inventory_items_withdrawal_eggs_check
    check (withdrawal_eggs_days is null or withdrawal_eggs_days >= 0);

comment on column public.inventory_items.withdrawal_meat_days is
  'Standard withholding in days. Null means the product carries none on record; it does not mean zero, and the two must never be conflated.';

-- The formulary is edited through the same controlled function as the rest of
-- the item, because `authenticated` deliberately holds no UPDATE on the table.
create or replace function public.set_item_formulary(
  p_id uuid,
  p_active_ingredient text default null,
  p_default_route text default null,
  p_withdrawal_meat_days integer default null,
  p_withdrawal_milk_days integer default null,
  p_withdrawal_eggs_days integer default null,
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

  if p_default_route is not null and p_default_route not in (
    'oral', 'im', 'iv', 'sc', 'topical', 'intramammary', 'in_water', 'in_feed'
  ) then
    raise exception 'Invalid route' using errcode = '22023';
  end if;

  -- Negative days would compute a withholding date in the past, which reads as
  -- "safe already" for a product that is not.
  if coalesce(p_withdrawal_meat_days, 0) < 0
     or coalesce(p_withdrawal_milk_days, 0) < 0
     or coalesce(p_withdrawal_eggs_days, 0) < 0 then
    raise exception 'A withholding period cannot be negative' using errcode = '22023';
  end if;

  update public.inventory_items
  set active_ingredient = nullif(trim(p_active_ingredient), ''),
      default_route = p_default_route,
      withdrawal_meat_days = p_withdrawal_meat_days,
      withdrawal_milk_days = p_withdrawal_milk_days,
      withdrawal_eggs_days = p_withdrawal_eggs_days,
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_id and vet_id = v_vet_id and deleted_at is null;

  if not found then
    raise exception 'Inventory item not found' using errcode = 'P0002';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'inventory_item.formulary_set', 'inventory_item', p_id, null,
    jsonb_build_object(
      'meat_days', p_withdrawal_meat_days,
      'milk_days', p_withdrawal_milk_days,
      'eggs_days', p_withdrawal_eggs_days
    )
  );
end;
$$;

grant execute on function public.set_item_formulary(uuid, text, text, integer, integer, integer, uuid) to authenticated;
revoke execute on function public.set_item_formulary(uuid, text, text, integer, integer, integer, uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- Which withholding periods a folder owes
-- ---------------------------------------------------------------------------

-- Mirrors requiredWithdrawals in @vetkeep/domain. Duplicated deliberately: the
-- interface uses it to ask the right questions, and the database uses it to
-- refuse the wrong answers. Neither may be trusted to enforce it alone.
create or replace function app_private.required_withdrawals(
  p_species text,
  p_purpose text
)
returns text[]
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    -- The obligation follows where the animal is going, not what it is. A pet
    -- rabbit and a meat rabbit are the same species.
    when p_purpose = 'pet' then array[]::text[]
    when p_species = 'cattle' and p_purpose = 'milk' then array['milk', 'meat']
    when p_species in ('sheep', 'goat') and p_purpose = 'milk' then array['milk', 'meat']
    when p_species = 'poultry' and p_purpose = 'eggs' then array['eggs', 'meat']
    when p_species in ('cattle', 'sheep', 'goat') then array['milk', 'meat']
    when p_species in ('pig', 'rabbit') then array['meat']
    when p_species = 'poultry' then array['meat']
    else array[]::text[]
  end
$$;

-- ---------------------------------------------------------------------------
-- Treatments
-- ---------------------------------------------------------------------------

create table if not exists public.treatments (
  id uuid primary key,
  vet_id uuid not null references public.vets(id) on delete restrict,
  visit_id uuid not null references public.visits(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,

  -- A product carried is linked. One the client buys elsewhere is only named,
  -- which is why the name is required and the link is not.
  inventory_item_id uuid references public.inventory_items(id) on delete restrict,
  inventory_batch_id uuid references public.inventory_batches(id) on delete restrict,
  product_name text not null check (char_length(trim(product_name)) between 1 and 160),
  active_ingredient text,

  dose_value numeric(10,3) not null check (dose_value > 0),
  dose_unit text not null check (char_length(trim(dose_unit)) between 1 and 24),
  route text not null check (route in (
    'oral', 'im', 'iv', 'sc', 'topical', 'intramammary', 'in_water', 'in_feed'
  )),
  administered_at timestamptz not null,
  duration_days integer check (duration_days is null or duration_days > 0),
  -- Group treatment: how many animals received it.
  animals_treated integer check (animals_treated is null or animals_treated > 0),

  -- Stored resolved rather than as a period. A later correction to the
  -- formulary must never silently move a date already given to a farmer in
  -- writing.
  meat_withhold_until date,
  milk_withhold_until date,
  eggs_withhold_until date,
  withdrawal_source text not null default 'formulary'
    check (withdrawal_source in ('formulary', 'manual', 'none_required')),

  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1 check (server_version > 0),
  created_by_device_id uuid references public.vet_devices(id) on delete set null,
  last_modified_by_device_id uuid references public.vet_devices(id) on delete set null
);

create index if not exists treatments_visit_idx on public.treatments (visit_id) where deleted_at is null;
create index if not exists treatments_patient_idx on public.treatments (patient_id, administered_at desc) where deleted_at is null;

-- Finding what is currently withheld is the query this table exists to answer.
create index if not exists treatments_withholding_idx
  on public.treatments (patient_id)
  where deleted_at is null
    and (meat_withhold_until is not null or milk_withhold_until is not null or eggs_withhold_until is not null);

create or replace function app_private.enforce_treatment_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1 from public.visits where id = new.visit_id and vet_id = new.vet_id
  ) then
    raise exception 'Record belongs to another account' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.patients where id = new.patient_id and vet_id = new.vet_id
  ) then
    raise exception 'Folder belongs to another account' using errcode = '42501';
  end if;

  if new.inventory_batch_id is not null and not exists (
    select 1 from public.inventory_batches where id = new.inventory_batch_id and vet_id = new.vet_id
  ) then
    raise exception 'Batch belongs to another account' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists treatments_tenant_guard on public.treatments;
create trigger treatments_tenant_guard
before insert or update on public.treatments
for each row execute function app_private.enforce_treatment_tenant();

-- The same version/timestamp trigger every other syncable table carries, so a
-- treatment participates in optimistic concurrency like the rest.
drop trigger if exists treatments_set_row_version on public.treatments;
create trigger treatments_set_row_version
before update on public.treatments
for each row execute function app_private.set_row_version();

alter table public.treatments enable row level security;

drop policy if exists treatments_select_own on public.treatments;
create policy treatments_select_own
on public.treatments
for select
to authenticated
using (vet_id = app_private.current_vet_id() and auth.jwt() ->> 'aal' = 'aal2');

revoke all on public.treatments from anon, authenticated;
grant select on public.treatments to authenticated;

-- ---------------------------------------------------------------------------
-- Recording a treatment
-- ---------------------------------------------------------------------------

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

  -- Formulary values are read from the carried product when the caller has not
  -- overridden them.
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
    -- Every missing period is named in one message. Reporting them one at a
    -- time makes a vet resubmit twice to learn what the second one was.
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

create or replace function public.delete_treatment(
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

  if char_length(trim(p_reason)) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  update public.treatments
  set deleted_at = now(),
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_id and vet_id = v_vet_id and deleted_at is null;

  if not found then
    raise exception 'Treatment not found' using errcode = 'P0002';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'treatment.deleted', 'treatment', p_id, trim(p_reason), '{}'::jsonb
  );
end;
$$;

grant execute on function public.record_treatment(
  uuid, uuid, text, numeric, text, text, timestamptz, uuid, uuid, text, integer, integer,
  date, date, date, text, text, uuid
) to authenticated;
grant execute on function public.delete_treatment(uuid, text, uuid) to authenticated;

revoke execute on function public.record_treatment(
  uuid, uuid, text, numeric, text, text, timestamptz, uuid, uuid, text, integer, integer,
  date, date, date, text, text, uuid
) from public, anon;
revoke execute on function public.delete_treatment(uuid, text, uuid) from public, anon;
