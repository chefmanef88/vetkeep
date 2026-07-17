-- VetKeep Phase 1 security hardening.
-- This migration closes default function-execution grants, protects account-state
-- transitions, limits audit payload size, and prevents active mutations by
-- suspended or closed veterinarian accounts.

create unique index if not exists vets_verified_license_number_unique_idx
on public.vets (lower(trim(license_number)))
where license_verified = true and license_number is not null;

alter table public.audit_events
  add constraint audit_events_metadata_size_check
  check (octet_length(metadata::text) <= 8192);

create or replace function app_private.require_active_vet()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_status text;
begin
  select v.id, v.account_status
    into v_vet_id, v_status
  from public.vets v
  where v.auth_user_id = auth.uid()
  limit 1;

  if v_vet_id is null then
    raise exception 'Veterinarian profile required' using errcode = '42501';
  end if;

  if v_status <> 'active' then
    raise exception 'Active veterinarian account required' using errcode = '42501';
  end if;

  return v_vet_id;
end;
$$;

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
  v_existing_status text;
begin
  if v_auth_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform app_private.require_aal2();

  select account_status into v_existing_status
  from public.vets
  where auth_user_id = v_auth_user_id;

  if v_existing_status is not null and v_existing_status <> 'active' then
    raise exception 'Active veterinarian account required' using errcode = '42501';
  end if;

  if char_length(trim(p_full_name)) not between 2 and 120 then
    raise exception 'Invalid full name' using errcode = '22023';
  end if;

  if char_length(trim(p_phone_display)) not between 7 and 30 then
    raise exception 'Invalid display phone number' using errcode = '22023';
  end if;

  if p_phone_e164 !~ '^[+][1-9][0-9]{7,14}$' then
    raise exception 'Invalid E.164 phone number' using errcode = '22023';
  end if;

  if p_whatsapp_e164 is not null
     and nullif(trim(p_whatsapp_e164), '') is not null
     and trim(p_whatsapp_e164) !~ '^[+][1-9][0-9]{7,14}$' then
    raise exception 'Invalid WhatsApp E.164 phone number' using errcode = '22023';
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
    jsonb_build_object('license_supplied', nullif(trim(p_license_number), '') is not null)
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
  v_vet_id uuid;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

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
  v_vet_id uuid;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  if p_platform not in ('ios', 'android') then
    raise exception 'Invalid device platform' using errcode = '22023';
  end if;

  if char_length(trim(p_device_name)) not between 1 and 120 then
    raise exception 'Invalid device name' using errcode = '22023';
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
  where public.vet_devices.vet_id = v_vet_id
    and public.vet_devices.revoked_at is null;

  if not found then
    raise exception 'Device ID is unavailable or revoked' using errcode = '42501';
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
  v_vet_id uuid;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

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

-- Device revocation remains available to suspended accounts so a user can
-- contain a suspected compromise. It does not require account_status = active.
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
  v_was_active boolean;
begin
  perform app_private.require_aal2();

  if v_vet_id is null then
    raise exception 'Veterinarian profile required' using errcode = '42501';
  end if;

  if char_length(trim(p_reason)) < 3 then
    raise exception 'Revocation reason is required' using errcode = '22023';
  end if;

  update public.vet_devices
  set revoked_at = now()
  where id = p_device_id
    and vet_id = v_vet_id
    and revoked_at is null
  returning true into v_was_active;

  if not found then
    if exists (
      select 1 from public.vet_devices
      where id = p_device_id and vet_id = v_vet_id and revoked_at is not null
    ) then
      return;
    end if;
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

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Explicitly
-- remove that default and allow only authenticated sessions to reach the
-- public RPC surface. Each function still derives identity from auth.uid().
revoke execute on function public.complete_vet_onboarding(text, text, text, text, text, text, text, text[]) from public, anon;
revoke execute on function public.update_vet_profile(text, text, text, text, text, text, text[]) from public, anon;
revoke execute on function public.register_current_device(uuid, text, text, text) from public, anon;
revoke execute on function public.touch_current_device(uuid, text) from public, anon;
revoke execute on function public.revoke_current_device(uuid, text) from public, anon;

revoke all on function app_private.require_active_vet() from public, anon, authenticated;
