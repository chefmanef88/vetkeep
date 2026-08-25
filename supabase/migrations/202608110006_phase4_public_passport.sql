-- Phase 4: the public health passport (brief §10).
--
-- A link a groomer, a boarding kennel or a buyer can open to see that an animal
-- is who it is said to be and that its vaccinations are current. It is not a
-- medical record and must never become one.
--
-- This is the only surface in VetKeep an anonymous stranger can reach, so the
-- shape of it matters more than its size:
--
--   * `anon` gets no SELECT on any table. It gets exactly one function, which
--     takes a token and returns an assembled document. There is no query
--     surface to widen by accident later.
--   * The allow-list lives in that function as literal field names. A column
--     added to `patients` tomorrow does not appear on the internet tomorrow.
--   * Only a hash of the token is stored (§10.1). A dump of this table does not
--     hand anybody a working set of passport URLs.
--   * Disabled by default until the owner has consented. Publishing an animal's
--     details is the owner's decision, not the veterinarian's convenience.
--
-- Two things deliberately deferred, rather than done badly:
--
--   The patient photograph. §10.3 allows it, but the attachments bucket is
--   private and the only ways to show it publicly are to make that bucket
--   public — which would expose every clinical document in it — or to put a
--   service role key in the web application. Neither is worth doing casually
--   for a photograph. The DTO omits it and the page reads fine without it.
--
--   IP-based rate limiting. §10.4 asks for it and Postgres is the wrong place:
--   the database sees whatever IP the edge chooses to pass it. Token-level
--   throttling is implemented here, where it can be enforced honestly, and the
--   IP limit belongs in front of the application.

-- ---------------------------------------------------------------------------
-- Configuration
-- ---------------------------------------------------------------------------

create table if not exists public.patient_passports (
  id uuid primary key,
  vet_id uuid not null references public.vets(id) on delete restrict,
  patient_id uuid not null unique references public.patients(id) on delete restrict,
  token_hash text not null unique,
  enabled boolean not null default false,
  owner_name_visibility text not null default 'hidden'
    check (owner_name_visibility in ('hidden', 'first_name', 'full_name')),
  -- A microchip number is how a stolen animal is traced. Off unless asked for.
  show_microchip boolean not null default false,
  consent_confirmed boolean not null default false,
  consent_confirmed_at timestamptz,
  consent_notes text check (consent_notes is null or char_length(consent_notes) <= 1000),
  enabled_at timestamptz,
  revoked_at timestamptz,
  rotated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Enabled without consent is the one state this table must never hold.
  check (enabled = false or consent_confirmed = true)
);

create index if not exists patient_passports_vet_idx on public.patient_passports (vet_id);

comment on table public.patient_passports is
  'Public proof-of-care configuration for one animal (§10). Disabled until the '
  'owner consents. Only the hash of the token is stored.';

-- Privacy-safe access log (§10.4 item 5). It records that a passport was
-- opened, never who opened it: no address, no user agent, no referrer. The
-- veterinarian can see their animal's page is being looked at, and nobody can
-- reconstruct a person's movements from this table.
create table if not exists public.passport_access_events (
  id bigserial primary key,
  passport_id uuid not null references public.patient_passports(id) on delete cascade,
  accessed_at timestamptz not null default now()
);

create index if not exists passport_access_events_passport_idx
  on public.passport_access_events (passport_id, accessed_at desc);

comment on table public.passport_access_events is
  'That a passport was viewed, and when. Deliberately carries nothing that '
  'could identify the viewer.';

-- §10.3: a consultation appears on the passport only when the veterinarian says
-- so, per consultation. Default false, because the default must never publish.
alter table public.visits
  add column if not exists passport_visible boolean not null default false;

comment on column public.visits.passport_visible is
  'Whether this consultation''s date, reason and final diagnosis may appear on '
  'the public passport (§10.3). Never the notes, examination or prescriptions.';

-- ---------------------------------------------------------------------------
-- Tokens
-- ---------------------------------------------------------------------------

-- Minted on the device, like every other identifier here, and only ever stored
-- hashed. The veterinarian's device keeps the raw token so the QR can be shown
-- again; losing it means rotating, which is the correct consequence of losing a
-- secret rather than a defect.
create or replace function app_private.hash_passport_token(p_token text)
returns text
language sql
immutable
set search_path = pg_catalog, extensions
as $$
  select encode(digest(p_token, 'sha256'), 'hex')
$$;

revoke all on function app_private.hash_passport_token(text) from public, anon, authenticated;

create or replace function app_private.assert_passport_token_shape(p_token text)
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  -- URL-safe, and long enough that guessing is not a strategy. 32 characters of
  -- this alphabet is roughly 190 bits.
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32,128}$' then
    raise exception 'Invalid passport token' using errcode = '22023';
  end if;
end;
$$;

revoke all on function app_private.assert_passport_token_shape(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The veterinarian's side
-- ---------------------------------------------------------------------------

create or replace function public.enable_patient_passport(
  p_id uuid,
  p_patient_id uuid,
  p_token text,
  p_consent_confirmed boolean,
  p_owner_name_visibility text default 'hidden',
  p_show_microchip boolean default false,
  p_consent_notes text default null,
  p_device_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_passport_id uuid;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();
  perform app_private.assert_passport_token_shape(p_token);

  if coalesce(p_consent_confirmed, false) is not true then
    raise exception 'The owner must consent before a passport is published'
      using errcode = '22023';
  end if;

  if p_owner_name_visibility not in ('hidden', 'first_name', 'full_name') then
    raise exception 'Invalid owner name visibility' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.patients
    where id = p_patient_id and vet_id = v_vet_id and deleted_at is null
  ) then
    raise exception 'Patient not found' using errcode = 'P0002';
  end if;

  insert into public.patient_passports (
    id, vet_id, patient_id, token_hash, enabled,
    owner_name_visibility, show_microchip,
    consent_confirmed, consent_confirmed_at, consent_notes, enabled_at
  ) values (
    p_id, v_vet_id, p_patient_id, app_private.hash_passport_token(p_token), true,
    p_owner_name_visibility, coalesce(p_show_microchip, false),
    true, now(), nullif(trim(p_consent_notes), ''), now()
  )
  on conflict (patient_id) do update
  set token_hash = excluded.token_hash,
      enabled = true,
      owner_name_visibility = excluded.owner_name_visibility,
      show_microchip = excluded.show_microchip,
      consent_confirmed = true,
      consent_confirmed_at = now(),
      consent_notes = excluded.consent_notes,
      enabled_at = now(),
      revoked_at = null,
      updated_at = now()
  returning id into v_passport_id;

  perform app_private.insert_audit_event(
    v_vet_id, 'passport.enabled', 'patient_passport', v_passport_id, null,
    jsonb_build_object(
      'patient_id', p_patient_id,
      'owner_name_visibility', p_owner_name_visibility,
      'show_microchip', coalesce(p_show_microchip, false)
    )
  );

  return v_passport_id;
end;
$$;

revoke all on function public.enable_patient_passport(uuid, uuid, text, boolean, text, boolean, text, uuid)
  from public, anon;
grant execute on function public.enable_patient_passport(uuid, uuid, text, boolean, text, boolean, text, uuid)
  to authenticated;

create or replace function public.revoke_patient_passport(
  p_patient_id uuid,
  p_device_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_passport_id uuid;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  update public.patient_passports
  set enabled = false, revoked_at = now(), updated_at = now()
  where patient_id = p_patient_id and vet_id = v_vet_id
  returning id into v_passport_id;

  if v_passport_id is null then
    raise exception 'Passport not found' using errcode = 'P0002';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'passport.revoked', 'patient_passport', v_passport_id, null,
    jsonb_build_object('patient_id', p_patient_id)
  );
end;
$$;

revoke all on function public.revoke_patient_passport(uuid, uuid) from public, anon;
grant execute on function public.revoke_patient_passport(uuid, uuid) to authenticated;

-- §10.5: rotation kills every QR code already printed, stuck to a kennel door,
-- or saved by an owner. It is an emergency action, not maintenance, and the
-- interface must say so before calling this.
create or replace function public.rotate_passport_token(
  p_patient_id uuid,
  p_token text,
  p_device_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_passport_id uuid;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();
  perform app_private.assert_passport_token_shape(p_token);

  update public.patient_passports
  set token_hash = app_private.hash_passport_token(p_token),
      rotated_at = now(),
      updated_at = now()
  where patient_id = p_patient_id and vet_id = v_vet_id
  returning id into v_passport_id;

  if v_passport_id is null then
    raise exception 'Passport not found' using errcode = 'P0002';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'passport.rotated', 'patient_passport', v_passport_id, null,
    jsonb_build_object('patient_id', p_patient_id)
  );
end;
$$;

revoke all on function public.rotate_passport_token(uuid, text, uuid) from public, anon;
grant execute on function public.rotate_passport_token(uuid, text, uuid) to authenticated;

create or replace function public.set_visit_passport_visible(
  p_visit_id uuid,
  p_visible boolean,
  p_device_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_status text;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  select workflow_status into v_status
  from public.visits
  where id = p_visit_id and vet_id = v_vet_id and deleted_at is null;

  if v_status is null then
    raise exception 'Record not found' using errcode = 'P0002';
  end if;

  -- A draft is not a finding. Publishing one would put a provisional thought on
  -- the internet under a veterinarian's name.
  if v_status <> 'completed' and coalesce(p_visible, false) then
    raise exception 'Only a signed record can appear on the passport'
      using errcode = '42501';
  end if;

  update public.visits
  set passport_visible = coalesce(p_visible, false)
  where id = p_visit_id and vet_id = v_vet_id;

  perform app_private.insert_audit_event(
    v_vet_id, 'passport.visit_visibility_set', 'visit', p_visit_id, null,
    jsonb_build_object('passport_visible', coalesce(p_visible, false))
  );
end;
$$;

revoke all on function public.set_visit_passport_visible(uuid, boolean, uuid) from public, anon;
grant execute on function public.set_visit_passport_visible(uuid, boolean, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.patient_passports enable row level security;
alter table public.passport_access_events enable row level security;

drop policy if exists patient_passports_select_own on public.patient_passports;
create policy patient_passports_select_own
on public.patient_passports
for select
to authenticated
using (vet_id = app_private.current_vet_id() and auth.jwt() ->> 'aal' = 'aal2');

drop policy if exists passport_access_events_select_own on public.passport_access_events;
create policy passport_access_events_select_own
on public.passport_access_events
for select
to authenticated
using (
  exists (
    select 1 from public.patient_passports p
    where p.id = passport_access_events.passport_id
      and p.vet_id = app_private.current_vet_id()
  )
  and auth.jwt() ->> 'aal' = 'aal2'
);

revoke all on public.patient_passports from anon, authenticated;
revoke all on public.passport_access_events from anon, authenticated;
grant select on public.patient_passports to authenticated;
grant select on public.passport_access_events to authenticated;

-- ---------------------------------------------------------------------------
-- The public side
-- ---------------------------------------------------------------------------

-- The single thing an anonymous caller may do. Every field returned is named
-- literally below; there is no `select *` anywhere in this function, so a
-- column added to a table later cannot appear here without somebody deciding it
-- should.
create or replace function public.passport_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_hash text;
  v_passport public.patient_passports;
  v_recent integer;
  v_result jsonb;
begin
  -- A malformed token is not a lookup. Rejected before touching the table, and
  -- rejected the same way a wrong one is.
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32,128}$' then
    return null;
  end if;

  v_hash := app_private.hash_passport_token(p_token);

  select * into v_passport
  from public.patient_passports
  where token_hash = v_hash
    and enabled = true
    and revoked_at is null
    and consent_confirmed = true;

  -- Revoked, disabled, unknown and never-consented are one answer. A caller
  -- learns nothing from the difference.
  if v_passport.id is null then
    return null;
  end if;

  -- Token-level throttling (§10.4 item 2). The IP limit belongs at the edge;
  -- this is the part the database can enforce honestly.
  select count(*)::integer into v_recent
  from public.passport_access_events
  where passport_id = v_passport.id
    and accessed_at > now() - interval '1 minute';

  if v_recent > 60 then
    raise exception 'Too many requests' using errcode = '53400';
  end if;

  select jsonb_build_object(
    'animal', jsonb_build_object(
      'name', p.name,
      'patient_code', p.patient_code,
      'species', p.species,
      'breed', p.breed,
      'sex', p.sex,
      'date_of_birth', p.date_of_birth,
      'date_of_birth_precision', p.date_of_birth_precision,
      'color_markings', p.color_markings,
      'kind', p.kind,
      'head_count', p.head_count,
      -- Off unless the veterinarian deliberately turned it on.
      'microchip_id', case when v_passport.show_microchip then p.microchip_id else null end
    ),
    'owner_name', case v_passport.owner_name_visibility
      when 'full_name' then c.name
      when 'first_name' then split_part(c.name, ' ', 1)
      else null
    end,
    'vaccinations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'vaccine', coalesce(pc.vaccine_type, pc.product_name),
        'product_name', pc.product_name,
        'date_given', pc.date_given,
        'next_due_date', pc.next_due_date
      ) order by pc.date_given desc)
      from public.preventive_care pc
      where pc.patient_id = p.id
        and pc.kind = 'vaccination'
        and pc.deleted_at is null
    ), '[]'::jsonb),
    -- Only what the veterinarian marked, and only three fields of it.
    'recent_care', coalesce((
      select jsonb_agg(jsonb_build_object(
        'visit_date', vi.visit_date,
        'reason', vi.chief_complaint,
        'diagnosis', vi.definitive_diagnosis
      ) order by vi.visit_date desc)
      from public.visits vi
      where vi.patient_id = p.id
        and vi.passport_visible = true
        and vi.workflow_status = 'completed'
        and vi.deleted_at is null
    ), '[]'::jsonb),
    'verified_by', jsonb_build_object(
      'veterinarian', vt.full_name,
      'business_name', vt.business_name,
      'licence_verified', vt.license_verified
    ),
    'last_updated', greatest(p.updated_at, v_passport.updated_at)
  ) into v_result
  from public.patients p
  join public.vets vt on vt.id = p.vet_id
  left join public.patient_owners po
    on po.patient_id = p.id and po.is_primary and po.valid_to is null and po.deleted_at is null
  left join public.clients c on c.id = po.client_id
  where p.id = v_passport.patient_id
    and p.deleted_at is null;

  if v_result is null then
    return null;
  end if;

  insert into public.passport_access_events (passport_id) values (v_passport.id);

  return v_result;
end;
$$;

revoke all on function public.passport_by_token(text) from public;
grant execute on function public.passport_by_token(text) to anon, authenticated;

comment on function public.passport_by_token(text) is
  'The only function an anonymous caller may execute (§10.4). Returns an '
  'allow-listed public document for a valid, enabled, consented passport, and '
  'null for everything else without distinguishing between the reasons.';
