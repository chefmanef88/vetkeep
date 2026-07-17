-- VetKeep Phase 1 secure platform foundation.
-- All mutations use controlled RPCs; client roles receive read access only.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table public.vets (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  license_number text check (license_number is null or char_length(trim(license_number)) between 2 and 80),
  license_verified boolean not null default false,
  phone_display text not null check (char_length(trim(phone_display)) between 7 and 30),
  phone_e164 text not null check (phone_e164 ~ '^[+][1-9][0-9]{7,14}$'),
  whatsapp_display text,
  whatsapp_e164 text check (whatsapp_e164 is null or whatsapp_e164 ~ '^[+][1-9][0-9]{7,14}$'),
  business_name text check (business_name is null or char_length(business_name) <= 160),
  service_areas text[] not null default '{}' check (cardinality(service_areas) <= 20 and array_position(service_areas, null) is null),
  account_status text not null default 'active'
    check (account_status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_version bigint not null default 1 check (server_version > 0)
);

create table public.vet_devices (
  id uuid primary key,
  vet_id uuid not null references public.vets(id) on delete cascade,
  device_name text not null check (char_length(trim(device_name)) between 1 and 120),
  platform text not null check (platform in ('ios', 'android')),
  app_version text check (app_version is null or char_length(app_version) <= 40),
  last_authenticated_at timestamptz not null,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_version bigint not null default 1 check (server_version > 0),
  unique (vet_id, id)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  vet_id uuid references public.vets(id) on delete restrict,
  actor_auth_user_id uuid references auth.users(id) on delete set null,
  actor_vet_id uuid references public.vets(id) on delete set null,
  action text not null check (char_length(action) between 2 and 100),
  entity_type text not null check (char_length(entity_type) between 2 and 100),
  entity_id uuid,
  reason text check (reason is null or char_length(reason) <= 500),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  check (jsonb_typeof(metadata) = 'object')
);

create index vets_auth_user_id_idx on public.vets (auth_user_id);
create index vet_devices_vet_id_idx on public.vet_devices (vet_id);
create index vet_devices_active_idx on public.vet_devices (vet_id, revoked_at) where revoked_at is null;
create index audit_events_vet_time_idx on public.audit_events (vet_id, occurred_at desc);
create index audit_events_entity_idx on public.audit_events (entity_type, entity_id, occurred_at desc);

comment on table public.audit_events is
  'Append-only security and domain audit trail. Never store clinical prose or direct personal identifiers in metadata.';

create or replace function app_private.current_vet_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select v.id
  from public.vets v
  where v.auth_user_id = auth.uid()
  limit 1
$$;

create or replace function app_private.require_aal2()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Multi-factor authentication required' using errcode = '42501';
  end if;
end;
$$;

create or replace function app_private.set_row_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  new.server_version := old.server_version + 1;
  return new;
end;
$$;

create trigger vets_set_row_version
before update on public.vets
for each row execute function app_private.set_row_version();

create trigger vet_devices_set_row_version
before update on public.vet_devices
for each row execute function app_private.set_row_version();

create or replace function app_private.insert_audit_event(
  p_vet_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_vet_id uuid;
begin
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'Audit metadata must be a JSON object';
  end if;

  v_actor_vet_id := app_private.current_vet_id();

  insert into public.audit_events (
    vet_id,
    actor_auth_user_id,
    actor_vet_id,
    action,
    entity_type,
    entity_id,
    reason,
    metadata
  ) values (
    p_vet_id,
    auth.uid(),
    v_actor_vet_id,
    p_action,
    p_entity_type,
    p_entity_id,
    nullif(trim(p_reason), ''),
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function app_private.prevent_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'audit_events is append-only';
end;
$$;

create trigger audit_events_immutable
before update or delete on public.audit_events
for each row execute function app_private.prevent_audit_mutation();

create or replace function public.complete_vet_onboarding(
  p_full_name text,
  p_phone_display text,
  p_phone_e164 text,
  p_license_number text default null,
  p_whatsapp_display text default null,
  p_whatsapp_e164 text default null,
  p_business_name text default null,
  p_service_areas text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_vet_id uuid;
begin
  if v_auth_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform app_private.require_aal2();

  if char_length(trim(p_full_name)) not between 2 and 120 then
    raise exception 'Invalid full name' using errcode = '22023';
  end if;

  if p_phone_e164 !~ '^[+][1-9][0-9]{7,14}$' then
    raise exception 'Invalid E.164 phone number' using errcode = '22023';
  end if;

  insert into public.vets (
    auth_user_id,
    full_name,
    license_number,
    phone_display,
    phone_e164,
    whatsapp_display,
    whatsapp_e164,
    business_name,
    service_areas
  ) values (
    v_auth_user_id,
    trim(p_full_name),
    nullif(trim(p_license_number), ''),
    trim(p_phone_display),
    trim(p_phone_e164),
    nullif(trim(p_whatsapp_display), ''),
    nullif(trim(p_whatsapp_e164), ''),
    nullif(trim(p_business_name), ''),
    coalesce(p_service_areas, '{}')
  )
  on conflict (auth_user_id) do update
    set full_name = excluded.full_name,
        license_number = case
          when public.vets.license_verified then public.vets.license_number
          else excluded.license_number
        end,
        phone_display = excluded.phone_display,
        phone_e164 = excluded.phone_e164,
        whatsapp_display = excluded.whatsapp_display,
        whatsapp_e164 = excluded.whatsapp_e164,
        business_name = excluded.business_name,
        service_areas = excluded.service_areas
  returning id into v_vet_id;

  perform app_private.insert_audit_event(
    v_vet_id,
    'vet.onboarding_completed',
    'vet',
    v_vet_id,
    null,
    jsonb_build_object('license_supplied', p_license_number is not null)
  );

  return v_vet_id;
end;
$$;

create or replace function public.update_vet_profile(
  p_full_name text,
  p_phone_display text,
  p_phone_e164 text,
  p_whatsapp_display text default null,
  p_whatsapp_e164 text default null,
  p_business_name text default null,
  p_service_areas text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid := app_private.current_vet_id();
begin
  if v_vet_id is null then
    raise exception 'Veterinarian profile required' using errcode = '42501';
  end if;

  perform app_private.require_aal2();

  update public.vets
  set full_name = trim(p_full_name),
      phone_display = trim(p_phone_display),
      phone_e164 = trim(p_phone_e164),
      whatsapp_display = nullif(trim(p_whatsapp_display), ''),
      whatsapp_e164 = nullif(trim(p_whatsapp_e164), ''),
      business_name = nullif(trim(p_business_name), ''),
      service_areas = coalesce(p_service_areas, '{}')
  where id = v_vet_id;

  perform app_private.insert_audit_event(
    v_vet_id,
    'vet.profile_updated',
    'vet',
    v_vet_id,
    null,
    '{}'::jsonb
  );
end;
$$;

create or replace function public.register_current_device(
  p_device_id uuid,
  p_device_name text,
  p_platform text,
  p_app_version text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid := app_private.current_vet_id();
begin
  if v_vet_id is null then
    raise exception 'Veterinarian profile required' using errcode = '42501';
  end if;

  perform app_private.require_aal2();

  if p_platform not in ('ios', 'android') then
    raise exception 'Invalid device platform' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.vet_devices
    where id = p_device_id and revoked_at is not null
  ) then
    raise exception 'Revoked device identifiers cannot be re-registered' using errcode = '42501';
  end if;

  insert into public.vet_devices (
    id,
    vet_id,
    device_name,
    platform,
    app_version,
    last_authenticated_at,
    last_seen_at,
    revoked_at
  ) values (
    p_device_id,
    v_vet_id,
    trim(p_device_name),
    p_platform,
    nullif(trim(p_app_version), ''),
    now(),
    now(),
    null
  )
  on conflict (id) do update
    set device_name = excluded.device_name,
        platform = excluded.platform,
        app_version = excluded.app_version,
        last_authenticated_at = now(),
        last_seen_at = now()
  where public.vet_devices.vet_id = v_vet_id;

  if not found then
    raise exception 'Device ID belongs to another account' using errcode = '42501';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id,
    'device.registered',
    'vet_device',
    p_device_id,
    null,
    jsonb_build_object('platform', p_platform, 'app_version', p_app_version)
  );
end;
$$;

create or replace function public.touch_current_device(
  p_device_id uuid,
  p_app_version text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid := app_private.current_vet_id();
begin
  perform app_private.require_aal2();

  if v_vet_id is null then
    raise exception 'Veterinarian profile required' using errcode = '42501';
  end if;

  update public.vet_devices
  set last_seen_at = now(),
      app_version = coalesce(nullif(trim(p_app_version), ''), app_version)
  where id = p_device_id
    and vet_id = v_vet_id
    and revoked_at is null;

  if not found then
    raise exception 'Active registered device not found' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.revoke_current_device(
  p_device_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid := app_private.current_vet_id();
begin
  perform app_private.require_aal2();

  if v_vet_id is null then
    raise exception 'Veterinarian profile required' using errcode = '42501';
  end if;

  if char_length(trim(p_reason)) < 3 then
    raise exception 'Revocation reason is required' using errcode = '22023';
  end if;

  update public.vet_devices
  set revoked_at = coalesce(revoked_at, now())
  where id = p_device_id and vet_id = v_vet_id;

  if not found then
    raise exception 'Device not found' using errcode = 'P0002';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id,
    'device.revoked',
    'vet_device',
    p_device_id,
    trim(p_reason),
    '{}'::jsonb
  );
end;
$$;

alter table public.vets enable row level security;
alter table public.vet_devices enable row level security;
alter table public.audit_events enable row level security;

create policy vets_select_own
on public.vets
for select
to authenticated
using (auth_user_id = auth.uid() and auth.jwt() ->> 'aal' = 'aal2');

create policy vet_devices_select_own
on public.vet_devices
for select
to authenticated
using (vet_id = app_private.current_vet_id() and auth.jwt() ->> 'aal' = 'aal2');

create policy audit_events_select_own
on public.audit_events
for select
to authenticated
using (vet_id = app_private.current_vet_id() and auth.jwt() ->> 'aal' = 'aal2');

revoke all on public.vets from anon, authenticated;
revoke all on public.vet_devices from anon, authenticated;
revoke all on public.audit_events from anon, authenticated;

grant select on public.vets to authenticated;
grant select on public.vet_devices to authenticated;
grant select on public.audit_events to authenticated;

grant execute on function public.complete_vet_onboarding(text, text, text, text, text, text, text, text[]) to authenticated;
grant execute on function public.update_vet_profile(text, text, text, text, text, text, text[]) to authenticated;
grant execute on function public.register_current_device(uuid, text, text, text) to authenticated;
grant execute on function public.touch_current_device(uuid, text) to authenticated;
grant execute on function public.revoke_current_device(uuid, text) to authenticated;

revoke all on all functions in schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;
grant execute on function app_private.current_vet_id() to authenticated;
grant execute on function app_private.require_aal2() to authenticated;
