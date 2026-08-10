-- Phase 4: vaccination and deworming.
--
-- The brief sketched a `vaccinations` table in §7.7 and the Phase 2 migration
-- never created it. Deworming was not covered at all, though a vet records the
-- two in the same breath and a farmer asks about them together.
--
-- One table, not two. A vaccination and a deworming differ in what is chosen
-- from a list and what is typed, but the question they answer is identical:
-- what protection does this animal carry, and when is the next one due. Two
-- tables would mean two reminder paths, two queries on the folder, and two
-- places for "what is due" to disagree.

create table if not exists public.preventive_care (
  id uuid primary key,
  vet_id uuid not null references public.vets(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  -- Often given during a consultation, but a vaccination run down a row of
  -- kennels is not a consultation, so the link is optional.
  visit_id uuid references public.visits(id) on delete set null,

  kind text not null check (kind in ('vaccination', 'deworming')),

  -- Vaccinations are chosen from a list so a folder can be searched for who is
  -- due for rabies. A dewormer is typed, because the products change faster
  -- than a controlled list can follow.
  vaccine_type text check (vaccine_type is null or vaccine_type in (
    -- Dogs
    'dhlpp', 'anti_rabies',
    -- Cats
    'fpl', 'tricat',
    -- Poultry
    'newcastle', 'gumboro', 'fowl_pox',
    -- Cattle
    'anthrax', 'blackleg', 'cbpp', 'fmd',
    -- Sheep and goats
    'ppr',
    'other'
  )),

  -- The brand for a vaccine, the product for a dewormer.
  product_name text not null check (char_length(trim(product_name)) between 1 and 160),
  manufacturer text check (manufacturer is null or char_length(trim(manufacturer)) <= 160),
  batch_lot_number text check (batch_lot_number is null or char_length(trim(batch_lot_number)) <= 80),
  -- Free text: "1 ml", "one tablet per 10 kg", "2 ml per bird in water".
  dose text check (dose is null or char_length(trim(dose)) <= 120),
  route text check (route is null or route in (
    'oral', 'im', 'iv', 'sc', 'topical', 'intranasal', 'in_water', 'in_feed', 'wing_web', 'eye_drop'
  )),
  -- Group work: how many animals were done.
  animals_treated integer check (animals_treated is null or animals_treated > 0),

  date_given date not null,
  next_due_date date,
  notes text check (notes is null or char_length(notes) <= 2000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1 check (server_version > 0),
  created_by_device_id uuid references public.vet_devices(id) on delete set null,
  last_modified_by_device_id uuid references public.vet_devices(id) on delete set null,

  -- A vaccination without a type cannot be searched for or reminded about,
  -- which is most of what recording it is for.
  constraint preventive_care_vaccination_needs_type check (
    kind <> 'vaccination' or vaccine_type is not null
  ),
  constraint preventive_care_deworming_has_no_vaccine_type check (
    kind <> 'deworming' or vaccine_type is null
  ),
  -- A next dose before the one just given is a typing mistake, and it would
  -- show as overdue the moment it was saved.
  constraint preventive_care_due_after_given check (
    next_due_date is null or next_due_date >= date_given
  )
);

create index if not exists preventive_care_patient_idx
  on public.preventive_care (patient_id, date_given desc)
  where deleted_at is null;

-- "Who is due, and when" is the query this table exists to answer.
create index if not exists preventive_care_due_idx
  on public.preventive_care (vet_id, next_due_date)
  where deleted_at is null and next_due_date is not null;

create or replace function app_private.enforce_preventive_care_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1 from public.patients where id = new.patient_id and vet_id = new.vet_id
  ) then
    raise exception 'Folder belongs to another account' using errcode = '42501';
  end if;

  if new.visit_id is not null and not exists (
    select 1 from public.visits where id = new.visit_id and vet_id = new.vet_id
  ) then
    raise exception 'Record belongs to another account' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists preventive_care_tenant_guard on public.preventive_care;
create trigger preventive_care_tenant_guard
before insert or update on public.preventive_care
for each row execute function app_private.enforce_preventive_care_tenant();

drop trigger if exists preventive_care_set_row_version on public.preventive_care;
create trigger preventive_care_set_row_version
before update on public.preventive_care
for each row execute function app_private.set_row_version();

alter table public.preventive_care enable row level security;

drop policy if exists preventive_care_select_own on public.preventive_care;
create policy preventive_care_select_own
on public.preventive_care
for select
to authenticated
using (vet_id = app_private.current_vet_id() and auth.jwt() ->> 'aal' = 'aal2');

revoke all on public.preventive_care from anon, authenticated;
grant select on public.preventive_care to authenticated;

-- ---------------------------------------------------------------------------
-- Recording
-- ---------------------------------------------------------------------------

create or replace function public.record_preventive_care(
  p_id uuid,
  p_patient_id uuid,
  p_kind text,
  p_product_name text,
  p_date_given date,
  p_vaccine_type text default null,
  p_manufacturer text default null,
  p_batch_lot_number text default null,
  p_dose text default null,
  p_route text default null,
  p_animals_treated integer default null,
  p_next_due_date date default null,
  p_visit_id uuid default null,
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
  v_owns_patient boolean;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  if p_kind not in ('vaccination', 'deworming') then
    raise exception 'Invalid preventive care kind' using errcode = '22023';
  end if;

  if char_length(trim(coalesce(p_product_name, ''))) not between 1 and 160 then
    raise exception 'Name the product that was given' using errcode = '22023';
  end if;

  if p_date_given is null then
    raise exception 'A date given is required' using errcode = '22023';
  end if;

  -- Distinct from a general date check: recording a future vaccination as
  -- already given would make an animal look protected when it is not.
  if p_date_given > (now() at time zone 'UTC')::date then
    raise exception 'A date given cannot be in the future' using errcode = '22023';
  end if;

  if p_kind = 'vaccination' and p_vaccine_type is null then
    raise exception 'Choose which vaccine was given' using errcode = '22023';
  end if;

  if p_kind = 'deworming' and p_vaccine_type is not null then
    raise exception 'A dewormer does not carry a vaccine type' using errcode = '22023';
  end if;

  if p_next_due_date is not null and p_next_due_date < p_date_given then
    raise exception 'The next dose cannot be due before the one just given' using errcode = '22023';
  end if;

  select true into v_owns_patient
  from public.patients
  where id = p_patient_id and vet_id = v_vet_id and deleted_at is null;

  if v_owns_patient is null then
    raise exception 'Folder not found' using errcode = 'P0002';
  end if;

  insert into public.preventive_care (
    id, vet_id, patient_id, visit_id, kind, vaccine_type,
    product_name, manufacturer, batch_lot_number, dose, route, animals_treated,
    date_given, next_due_date, notes,
    created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, p_patient_id, p_visit_id, p_kind, p_vaccine_type,
    trim(p_product_name), nullif(trim(p_manufacturer), ''),
    nullif(trim(p_batch_lot_number), ''), nullif(trim(p_dose), ''), p_route, p_animals_treated,
    p_date_given, p_next_due_date, nullif(trim(p_notes), ''),
    p_device_id, p_device_id
  )
  on conflict (id) do nothing;

  -- Idempotent under a retried sync, like every other create in this schema.
  if not found then
    if exists (select 1 from public.preventive_care where id = p_id and vet_id = v_vet_id) then
      return p_id;
    end if;
    raise exception 'Preventive care ID is unavailable' using errcode = '42501';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id,
    case when p_kind = 'vaccination' then 'vaccination.recorded' else 'deworming.recorded' end,
    'preventive_care', p_id, null,
    jsonb_build_object(
      'patient_id', p_patient_id,
      'kind', p_kind,
      'vaccine_type', p_vaccine_type,
      'date_given', p_date_given,
      'next_due_date', p_next_due_date
    )
  );

  return p_id;
end;
$$;

create or replace function public.delete_preventive_care(
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

  update public.preventive_care
  set deleted_at = now(),
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_id and vet_id = v_vet_id and deleted_at is null;

  if not found then
    raise exception 'Preventive care record not found' using errcode = 'P0002';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'preventive_care.deleted', 'preventive_care', p_id, trim(p_reason), '{}'::jsonb
  );
end;
$$;

grant execute on function public.record_preventive_care(
  uuid, uuid, text, text, date, text, text, text, text, text, integer, date, uuid, text, uuid
) to authenticated;
grant execute on function public.delete_preventive_care(uuid, text, uuid) to authenticated;

revoke execute on function public.record_preventive_care(
  uuid, uuid, text, text, date, text, text, text, text, text, integer, date, uuid, text, uuid
) from public, anon;
revoke execute on function public.delete_preventive_care(uuid, text, uuid) from public, anon;
