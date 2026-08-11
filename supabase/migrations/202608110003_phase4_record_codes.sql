-- Phase 4: a reference both parties can name (brief §4.1, §10.6).
--
-- A consultation record can be handed to the client. Until now the document
-- carried the patient code and the date, which is not an identifier: an animal
-- seen morning and evening on the same farm visit produces two documents with
-- the same reference, and "the record from the third" stops picking out either
-- of them. The 10 August revision promised a VK-R- series for exactly this and
-- it was never built.
--
-- Codes are minted on the device, like the client and patient series, because a
-- record is created offline and must carry its reference from the moment it
-- exists — not from whenever it first reaches a server. Uniqueness comes from
-- the random segment rather than a counter, which is the only thing that works
-- when two devices are writing without seeing each other.

-- ---------------------------------------------------------------------------
-- The column
-- ---------------------------------------------------------------------------

alter table public.visits
  add column if not exists record_code text;

-- Crockford Base32, matching packages/domain/src/codes.ts: digits plus
-- uppercase letters with I, L, O and U removed. I/L/O go because they are
-- misread as 1/1/0 when a code is read aloud down a telephone, which is how
-- these codes actually travel. The pattern is repeated literally rather than
-- referencing a function so the constraint stays dump-safe.
alter table public.visits
  drop constraint if exists visits_record_code_check;

alter table public.visits
  add constraint visits_record_code_check
  check (record_code is null or record_code ~ '^VK-R-[0-9A-HJKMNP-TV-Z]{6}$');

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------

-- Records written before this migration still need a reference; a signed record
-- cannot be reissued without one. Generated here rather than left null, because
-- a nullable code would mean every reader of a shared document has to handle its
-- absence forever.
--
-- The trigger that freezes a signed record compares clinical columns and this is
-- not one of them, so the backfill does not fight it.
do $$
declare
  v_alphabet text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  r record;
  v_code text;
  v_attempt integer;
begin
  for r in select id, vet_id from public.visits where record_code is null loop
    v_attempt := 0;
    loop
      v_attempt := v_attempt + 1;
      v_code := 'VK-R-';
      for i in 1..6 loop
        -- gen_random_bytes would be tidier, but the modulo bias across a
        -- 32-character alphabet is nil and this avoids depending on pgcrypto
        -- being in the search_path of a DO block.
        v_code := v_code || substr(v_alphabet, 1 + floor(random() * 32)::integer, 1);
      end loop;

      exit when not exists (
        select 1 from public.visits
        where vet_id = r.vet_id and record_code = v_code
      );

      if v_attempt > 50 then
        raise exception 'Could not allocate a record code for visit %', r.id;
      end if;
    end loop;

    update public.visits set record_code = v_code where id = r.id;
  end loop;
end;
$$;

alter table public.visits
  alter column record_code set not null;

-- Unique per veterinarian, not globally: the codes are tenant-facing and two
-- practices are never reading each other's documents.
create unique index if not exists visits_vet_record_code_idx
  on public.visits (vet_id, record_code);

comment on column public.visits.record_code is
  'Human-readable reference for this consultation, VK-R-XXXXXX. Minted on the '
  'device so an offline record carries it from creation. Printed on the copy '
  'given to the client (§10.6).';

-- ---------------------------------------------------------------------------
-- Creating a record with one
-- ---------------------------------------------------------------------------

drop function if exists public.create_visit(uuid, uuid, timestamptz, text, text, uuid);

-- p_record_code is appended rather than slotted in beside the other identity
-- arguments, where it would read better. A new parameter in the middle silently
-- reinterprets every positional call: 'Lethargy' arrives as a record code and is
-- rejected, or worse, something plausible arrives and is accepted. The tests
-- caught exactly that. Position at the end is uglier and cannot misfire.
create or replace function public.create_visit(
  p_id uuid,
  p_patient_id uuid,
  p_visit_date timestamptz,
  p_visit_type text,
  p_chief_complaint text default null,
  p_device_id uuid default null,
  p_record_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_species text;
  v_kind text;
  v_code text;
  v_alphabet text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  if p_visit_type is null or p_visit_type not in (
    'home_call', 'clinic_visit', 'field_visit', 'emergency', 'follow_up', 'teleconsult'
  ) then
    raise exception 'Invalid visit type' using errcode = '22023';
  end if;

  -- A client that predates this parameter still creates valid records; the
  -- server mints a code rather than refusing. Rejecting them would mean an old
  -- build in the field stops being able to write records at all.
  if p_record_code is null then
    loop
      v_code := 'VK-R-';
      for i in 1..6 loop
        v_code := v_code || substr(v_alphabet, 1 + floor(random() * 32)::integer, 1);
      end loop;
      exit when not exists (
        select 1 from public.visits where vet_id = v_vet_id and record_code = v_code
      );
    end loop;
  else
    v_code := upper(trim(p_record_code));
    if v_code !~ '^VK-R-[0-9A-HJKMNP-TV-Z]{6}$' then
      raise exception 'Invalid record code format' using errcode = '22023';
    end if;
  end if;

  select species, kind into v_species, v_kind
  from public.patients
  where id = p_patient_id and vet_id = v_vet_id and deleted_at is null;

  if v_species is null then
    raise exception 'Patient not found' using errcode = 'P0002';
  end if;

  insert into public.visits (
    id, vet_id, patient_id, visit_date, visit_type, record_code, chief_complaint,
    created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, p_patient_id, p_visit_date, p_visit_type, v_code,
    nullif(trim(p_chief_complaint), ''), p_device_id, p_device_id
  )
  on conflict (id) do nothing;

  if not found then
    -- A replayed sync is not an error. The record already exists with the code
    -- it was created with, and that code is what the client was given.
    if exists (select 1 from public.visits where id = p_id and vet_id = v_vet_id) then
      return p_id;
    end if;
    raise exception 'Visit ID is unavailable' using errcode = '42501';
  end if;

  -- Seeded from the species, so a bird is asked about its crop and a flock is
  -- asked nothing. Every system starts 'not_examined' so a normal finding can
  -- only ever be a deliberate act.
  insert into public.physical_exam_findings (
    vet_id, visit_id, system_name, status,
    created_by_device_id, last_modified_by_device_id
  )
  select v_vet_id, p_id, s.system_name, 'not_examined', p_device_id, p_device_id
  from unnest(app_private.exam_system_names(v_species, v_kind)) as s(system_name)
  on conflict (visit_id, system_name) do nothing;

  perform app_private.insert_audit_event(
    v_vet_id, 'visit.created', 'visit', p_id, null,
    jsonb_build_object('patient_id', p_patient_id, 'visit_type', p_visit_type, 'record_code', v_code)
  );

  return p_id;
end;
$$;

revoke all on function public.create_visit(uuid, uuid, timestamptz, text, text, uuid, text)
  from public, anon;
grant execute on function public.create_visit(uuid, uuid, timestamptz, text, text, uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Immutability
-- ---------------------------------------------------------------------------

-- The code is printed on a document that has left the building. Whatever else a
-- correction may do, it can never renumber a record somebody is holding.
create or replace function app_private.prevent_record_code_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.record_code is distinct from new.record_code then
    raise exception 'The reference of a record cannot change' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists visits_prevent_record_code_change on public.visits;
create trigger visits_prevent_record_code_change
before update on public.visits
for each row execute function app_private.prevent_record_code_change();
