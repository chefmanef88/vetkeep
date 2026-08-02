-- VetKeep Phase 2 core practice workflow: clients, patients, and ownership history.
-- Follows the Phase 1 pattern: no direct table mutation from client roles, only
-- controlled SECURITY DEFINER RPCs. Row identifiers are client-generated (offline-safe)
-- and mutations are idempotent so a retried offline sync cannot duplicate records.

create extension if not exists pg_trgm with schema extensions;

create table public.clients (
  id uuid primary key,
  vet_id uuid not null references public.vets(id) on delete restrict,
  client_code text not null check (client_code ~ '^VK-C-[0-9A-HJKMNP-TV-Z]{6}$'),
  name text not null check (char_length(trim(name)) between 1 and 160),
  phone_display text not null check (char_length(trim(phone_display)) between 7 and 30),
  phone_e164 text not null check (phone_e164 ~ '^[+][1-9][0-9]{7,14}$'),
  whatsapp_display text,
  whatsapp_e164 text check (whatsapp_e164 is null or whatsapp_e164 ~ '^[+][1-9][0-9]{7,14}$'),
  email text check (email is null or char_length(email) <= 254),
  address text check (address is null or char_length(address) <= 500),
  location_latitude numeric(9,6) check (location_latitude is null or location_latitude between -90 and 90),
  location_longitude numeric(9,6) check (location_longitude is null or location_longitude between -180 and 180),
  communication_consent boolean not null default false,
  consent_recorded_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1 check (server_version > 0),
  created_by_device_id uuid references public.vet_devices(id) on delete set null,
  last_modified_by_device_id uuid references public.vet_devices(id) on delete set null,
  unique (vet_id, client_code),
  check (communication_consent = false or consent_recorded_at is not null)
);

create table public.patients (
  id uuid primary key,
  vet_id uuid not null references public.vets(id) on delete restrict,
  patient_code text not null check (patient_code ~ '^VK-P-[0-9A-HJKMNP-TV-Z]{6}$'),
  name text not null check (char_length(trim(name)) between 1 and 160),
  species text not null check (char_length(trim(species)) between 2 and 60),
  breed text check (breed is null or char_length(breed) <= 120),
  sex text not null
    check (sex in ('male', 'female', 'male_neutered', 'female_spayed', 'unknown')),
  date_of_birth date,
  date_of_birth_precision text not null default 'exact'
    check (date_of_birth_precision in ('exact', 'estimated', 'unknown')),
  color_markings text check (color_markings is null or char_length(color_markings) <= 300),
  microchip_id text check (microchip_id is null or char_length(trim(microchip_id)) between 5 and 40),
  identification_notes text check (identification_notes is null or char_length(identification_notes) <= 1000),
  status text not null default 'active'
    check (status in ('active', 'deceased', 'transferred', 'inactive')),
  deceased_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1 check (server_version > 0),
  created_by_device_id uuid references public.vet_devices(id) on delete set null,
  last_modified_by_device_id uuid references public.vet_devices(id) on delete set null,
  unique (vet_id, patient_code),
  check (status <> 'deceased' or deceased_at is not null)
);

-- Ownership is not a single permanent column because caregiving relationships change.
create table public.patient_owners (
  id uuid primary key,
  vet_id uuid not null references public.vets(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  relationship text not null default 'owner' check (char_length(trim(relationship)) between 2 and 40),
  is_primary boolean not null default false,
  valid_from date not null default current_date,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1 check (server_version > 0),
  created_by_device_id uuid references public.vet_devices(id) on delete set null,
  last_modified_by_device_id uuid references public.vet_devices(id) on delete set null,
  check (valid_to is null or valid_to >= valid_from)
);

create unique index patient_owners_one_active_primary_idx
  on public.patient_owners (patient_id)
  where is_primary = true and valid_to is null and deleted_at is null;

create index clients_vet_id_idx on public.clients (vet_id) where deleted_at is null;
create index clients_phone_e164_idx on public.clients (vet_id, phone_e164);
create index clients_name_trgm_idx on public.clients using gin (name extensions.gin_trgm_ops);

create index patients_vet_id_idx on public.patients (vet_id) where deleted_at is null;
create index patients_microchip_idx on public.patients (vet_id, microchip_id) where microchip_id is not null;
create index patients_name_trgm_idx on public.patients using gin (name extensions.gin_trgm_ops);

create index patient_owners_vet_id_idx on public.patient_owners (vet_id);
create index patient_owners_patient_idx on public.patient_owners (patient_id) where deleted_at is null;
create index patient_owners_client_idx on public.patient_owners (client_id) where deleted_at is null;

create trigger clients_set_row_version
before update on public.clients
for each row execute function app_private.set_row_version();

create trigger patients_set_row_version
before update on public.patients
for each row execute function app_private.set_row_version();

create trigger patient_owners_set_row_version
before update on public.patient_owners
for each row execute function app_private.set_row_version();

-- ---------------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------------

create or replace function public.create_client(
  p_id uuid,
  p_client_code text,
  p_name text,
  p_phone_display text,
  p_phone_e164 text,
  p_whatsapp_display text default null,
  p_whatsapp_e164 text default null,
  p_email text default null,
  p_address text default null,
  p_location_latitude numeric default null,
  p_location_longitude numeric default null,
  p_communication_consent boolean default false,
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
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  if char_length(trim(p_name)) not between 1 and 160 then
    raise exception 'Invalid client name' using errcode = '22023';
  end if;

  if p_phone_e164 !~ '^[+][1-9][0-9]{7,14}$' then
    raise exception 'Invalid E.164 phone number' using errcode = '22023';
  end if;

  if upper(trim(p_client_code)) !~ '^VK-C-[0-9A-HJKMNP-TV-Z]{6}$' then
    raise exception 'Invalid client code format' using errcode = '22023';
  end if;

  insert into public.clients (
    id, vet_id, client_code, name, phone_display, phone_e164,
    whatsapp_display, whatsapp_e164, email, address,
    location_latitude, location_longitude,
    communication_consent, consent_recorded_at, notes,
    created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, upper(trim(p_client_code)), trim(p_name),
    trim(p_phone_display), trim(p_phone_e164),
    nullif(trim(p_whatsapp_display), ''), nullif(trim(p_whatsapp_e164), ''),
    nullif(trim(p_email), ''), nullif(trim(p_address), ''),
    p_location_latitude, p_location_longitude,
    coalesce(p_communication_consent, false),
    case when coalesce(p_communication_consent, false) then now() else null end,
    nullif(trim(p_notes), ''),
    p_device_id, p_device_id
  )
  on conflict (id) do nothing;

  if not found then
    if exists (select 1 from public.clients where id = p_id and vet_id = v_vet_id) then
      return p_id;
    end if;
    raise exception 'Client ID is unavailable' using errcode = '42501';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'client.created', 'client', p_id, null,
    jsonb_build_object('client_code', upper(trim(p_client_code)))
  );

  return p_id;
end;
$$;

create or replace function public.update_client(
  p_id uuid,
  p_name text,
  p_phone_display text,
  p_phone_e164 text,
  p_whatsapp_display text default null,
  p_whatsapp_e164 text default null,
  p_email text default null,
  p_address text default null,
  p_location_latitude numeric default null,
  p_location_longitude numeric default null,
  p_communication_consent boolean default false,
  p_notes text default null,
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

  if char_length(trim(p_name)) not between 1 and 160 then
    raise exception 'Invalid client name' using errcode = '22023';
  end if;

  if p_phone_e164 !~ '^[+][1-9][0-9]{7,14}$' then
    raise exception 'Invalid E.164 phone number' using errcode = '22023';
  end if;

  update public.clients
  set name = trim(p_name),
      phone_display = trim(p_phone_display),
      phone_e164 = trim(p_phone_e164),
      whatsapp_display = nullif(trim(p_whatsapp_display), ''),
      whatsapp_e164 = nullif(trim(p_whatsapp_e164), ''),
      email = nullif(trim(p_email), ''),
      address = nullif(trim(p_address), ''),
      location_latitude = p_location_latitude,
      location_longitude = p_location_longitude,
      communication_consent = coalesce(p_communication_consent, false),
      consent_recorded_at = case
        when coalesce(p_communication_consent, false) then coalesce(consent_recorded_at, now())
        else null
      end,
      notes = nullif(trim(p_notes), ''),
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_id and vet_id = v_vet_id and deleted_at is null;

  if not found then
    raise exception 'Client not found' using errcode = 'P0002';
  end if;

  perform app_private.insert_audit_event(v_vet_id, 'client.updated', 'client', p_id, null, '{}'::jsonb);
end;
$$;

create or replace function public.delete_client(
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
    raise exception 'Deletion reason is required' using errcode = '22023';
  end if;

  update public.clients
  set deleted_at = now(),
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_id and vet_id = v_vet_id and deleted_at is null;

  if not found then
    raise exception 'Client not found' using errcode = 'P0002';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'client.deleted', 'client', p_id, trim(p_reason), '{}'::jsonb
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Patients
-- ---------------------------------------------------------------------------

create or replace function public.create_patient(
  p_id uuid,
  p_patient_code text,
  p_name text,
  p_species text,
  p_sex text,
  p_breed text default null,
  p_date_of_birth date default null,
  p_date_of_birth_precision text default 'exact',
  p_color_markings text default null,
  p_microchip_id text default null,
  p_identification_notes text default null,
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

  if char_length(trim(p_name)) not between 1 and 160 then
    raise exception 'Invalid patient name' using errcode = '22023';
  end if;

  if p_sex not in ('male', 'female', 'male_neutered', 'female_spayed', 'unknown') then
    raise exception 'Invalid sex value' using errcode = '22023';
  end if;

  if upper(trim(p_patient_code)) !~ '^VK-P-[0-9A-HJKMNP-TV-Z]{6}$' then
    raise exception 'Invalid patient code format' using errcode = '22023';
  end if;

  insert into public.patients (
    id, vet_id, patient_code, name, species, breed, sex,
    date_of_birth, date_of_birth_precision, color_markings,
    microchip_id, identification_notes,
    created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, upper(trim(p_patient_code)), trim(p_name), trim(p_species),
    nullif(trim(p_breed), ''), p_sex,
    p_date_of_birth, coalesce(p_date_of_birth_precision, 'exact'),
    nullif(trim(p_color_markings), ''),
    nullif(trim(p_microchip_id), ''), nullif(trim(p_identification_notes), ''),
    p_device_id, p_device_id
  )
  on conflict (id) do nothing;

  if not found then
    if exists (select 1 from public.patients where id = p_id and vet_id = v_vet_id) then
      return p_id;
    end if;
    raise exception 'Patient ID is unavailable' using errcode = '42501';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'patient.created', 'patient', p_id, null,
    jsonb_build_object('patient_code', upper(trim(p_patient_code)), 'species', trim(p_species))
  );

  return p_id;
end;
$$;

create or replace function public.update_patient(
  p_id uuid,
  p_name text,
  p_species text,
  p_sex text,
  p_breed text default null,
  p_date_of_birth date default null,
  p_date_of_birth_precision text default 'exact',
  p_color_markings text default null,
  p_microchip_id text default null,
  p_identification_notes text default null,
  p_status text default 'active',
  p_deceased_at date default null,
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

  if char_length(trim(p_name)) not between 1 and 160 then
    raise exception 'Invalid patient name' using errcode = '22023';
  end if;

  if p_status not in ('active', 'deceased', 'transferred', 'inactive') then
    raise exception 'Invalid patient status' using errcode = '22023';
  end if;

  if p_status = 'deceased' and p_deceased_at is null then
    raise exception 'Deceased patients require a deceased_at date' using errcode = '22023';
  end if;

  update public.patients
  set name = trim(p_name),
      species = trim(p_species),
      sex = p_sex,
      breed = nullif(trim(p_breed), ''),
      date_of_birth = p_date_of_birth,
      date_of_birth_precision = coalesce(p_date_of_birth_precision, 'exact'),
      color_markings = nullif(trim(p_color_markings), ''),
      microchip_id = nullif(trim(p_microchip_id), ''),
      identification_notes = nullif(trim(p_identification_notes), ''),
      status = p_status,
      deceased_at = case when p_status = 'deceased' then p_deceased_at else null end,
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_id and vet_id = v_vet_id and deleted_at is null;

  if not found then
    raise exception 'Patient not found' using errcode = 'P0002';
  end if;

  perform app_private.insert_audit_event(v_vet_id, 'patient.updated', 'patient', p_id, null, '{}'::jsonb);
end;
$$;

create or replace function public.delete_patient(
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
    raise exception 'Deletion reason is required' using errcode = '22023';
  end if;

  update public.patients
  set deleted_at = now(),
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_id and vet_id = v_vet_id and deleted_at is null;

  if not found then
    raise exception 'Patient not found' using errcode = 'P0002';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'patient.deleted', 'patient', p_id, trim(p_reason), '{}'::jsonb
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Patient ownership
-- ---------------------------------------------------------------------------

create or replace function public.create_patient_owner(
  p_id uuid,
  p_patient_id uuid,
  p_client_id uuid,
  p_relationship text default 'owner',
  p_is_primary boolean default true,
  p_valid_from date default current_date,
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

  if not exists (
    select 1 from public.patients
    where id = p_patient_id and vet_id = v_vet_id and deleted_at is null
  ) then
    raise exception 'Patient not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.clients
    where id = p_client_id and vet_id = v_vet_id and deleted_at is null
  ) then
    raise exception 'Client not found' using errcode = 'P0002';
  end if;

  if coalesce(p_is_primary, false) then
    update public.patient_owners
    set is_primary = false
    where patient_id = p_patient_id
      and vet_id = v_vet_id
      and is_primary = true
      and valid_to is null
      and deleted_at is null;
  end if;

  insert into public.patient_owners (
    id, vet_id, patient_id, client_id, relationship, is_primary, valid_from,
    created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, p_patient_id, p_client_id,
    coalesce(nullif(trim(p_relationship), ''), 'owner'),
    coalesce(p_is_primary, false), coalesce(p_valid_from, current_date),
    p_device_id, p_device_id
  )
  on conflict (id) do nothing;

  if not found then
    if exists (select 1 from public.patient_owners where id = p_id and vet_id = v_vet_id) then
      return p_id;
    end if;
    raise exception 'Patient owner ID is unavailable' using errcode = '42501';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'patient_owner.created', 'patient_owner', p_id, null,
    jsonb_build_object('patient_id', p_patient_id, 'client_id', p_client_id, 'is_primary', coalesce(p_is_primary, false))
  );

  return p_id;
end;
$$;

create or replace function public.end_patient_owner(
  p_id uuid,
  p_valid_to date,
  p_reason text default null,
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

  update public.patient_owners
  set valid_to = coalesce(p_valid_to, current_date),
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_id and vet_id = v_vet_id and deleted_at is null and valid_to is null;

  if not found then
    raise exception 'Active patient owner record not found' using errcode = 'P0002';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'patient_owner.ended', 'patient_owner', p_id, p_reason, '{}'::jsonb
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.clients enable row level security;
alter table public.patients enable row level security;
alter table public.patient_owners enable row level security;

create policy clients_select_own
on public.clients
for select
to authenticated
using (vet_id = app_private.current_vet_id() and auth.jwt() ->> 'aal' = 'aal2');

create policy patients_select_own
on public.patients
for select
to authenticated
using (vet_id = app_private.current_vet_id() and auth.jwt() ->> 'aal' = 'aal2');

create policy patient_owners_select_own
on public.patient_owners
for select
to authenticated
using (vet_id = app_private.current_vet_id() and auth.jwt() ->> 'aal' = 'aal2');

revoke all on public.clients from anon, authenticated;
revoke all on public.patients from anon, authenticated;
revoke all on public.patient_owners from anon, authenticated;

grant select on public.clients to authenticated;
grant select on public.patients to authenticated;
grant select on public.patient_owners to authenticated;

grant execute on function public.create_client(uuid, text, text, text, text, text, text, text, text, numeric, numeric, boolean, text, uuid) to authenticated;
grant execute on function public.update_client(uuid, text, text, text, text, text, text, text, numeric, numeric, boolean, text, uuid) to authenticated;
grant execute on function public.delete_client(uuid, text, uuid) to authenticated;

grant execute on function public.create_patient(uuid, text, text, text, text, text, date, text, text, text, text, uuid) to authenticated;
grant execute on function public.update_patient(uuid, text, text, text, text, date, text, text, text, text, text, date, uuid) to authenticated;
grant execute on function public.delete_patient(uuid, text, uuid) to authenticated;

grant execute on function public.create_patient_owner(uuid, uuid, uuid, text, boolean, date, uuid) to authenticated;
grant execute on function public.end_patient_owner(uuid, date, text, uuid) to authenticated;

revoke execute on function public.create_client(uuid, text, text, text, text, text, text, text, text, numeric, numeric, boolean, text, uuid) from public, anon;
revoke execute on function public.update_client(uuid, text, text, text, text, text, text, text, numeric, numeric, boolean, text, uuid) from public, anon;
revoke execute on function public.delete_client(uuid, text, uuid) from public, anon;

revoke execute on function public.create_patient(uuid, text, text, text, text, text, date, text, text, text, text, uuid) from public, anon;
revoke execute on function public.update_patient(uuid, text, text, text, text, date, text, text, text, text, text, date, uuid) from public, anon;
revoke execute on function public.delete_patient(uuid, text, uuid) from public, anon;

revoke execute on function public.create_patient_owner(uuid, uuid, uuid, text, boolean, date, uuid) from public, anon;
revoke execute on function public.end_patient_owner(uuid, date, text, uuid) from public, anon;
