-- Euthanasia.
--
-- Not a treatment with an unusual outcome. It ends the folder, it is the one
-- act an owner is most likely to question afterwards, and for a food animal it
-- decides whether the carcass may be eaten. It gets its own table.
--
-- Five decisions.
--
-- The reason is a list, not prose. A year later "the owner agreed it was time"
-- and "the owner could not afford the treatment" read very differently to a
-- council, and free text makes the second invisible. Financial is on the list
-- for exactly that reason: economic euthanasia is real, common, and nobody's
-- failing — a reason that cannot be recorded honestly gets recorded as
-- something else.
--
-- The method is recorded because it is not always an injection. A captive bolt
-- or a gunshot is the humane answer for cattle in a yard with no restraint,
-- and a system that only understands barbiturates makes the vet either lie or
-- leave it blank.
--
-- Death is confirmed separately from the act. The two are not the same event,
-- and the gap between them is where a mistake lives. Confirming it is the
-- veterinarian's statement that the animal is dead, and it is recorded as
-- such.
--
-- Carcass disposal is asked for food animals because the question does not end
-- at death. An animal euthanised with a barbiturate must never enter the food
-- chain or be eaten by scavengers, and the record is what proves that was
-- handled.
--
-- And it ends the folder: the patient's status becomes deceased in the same
-- transaction. A folder whose animal was euthanised must not still read
-- active, because the next person to open it will treat it as a live case.

create table if not exists public.euthanasia_records (
  id uuid primary key,
  vet_id uuid not null references public.vets(id) on delete restrict,
  visit_id uuid not null references public.visits(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,

  reason text not null check (reason in (
    'suffering',
    'poor_prognosis',
    'owner_request',
    'financial',
    'food_safety',
    'dangerous',
    'other'
  )),
  -- The category alone is never the whole story, and this is the one record a
  -- vet may have to defend. It is not optional.
  reason_detail text not null
    check (char_length(trim(reason_detail)) between 10 and 2000),

  method text not null check (method in ('injectable', 'captive_bolt', 'gunshot', 'other')),
  agent text check (agent is null or char_length(agent) <= 300),

  -- Separate from performed_at: the act and the confirmation are two events.
  death_confirmed boolean not null default false,
  death_confirmed_by text check (death_confirmed_by is null or char_length(death_confirmed_by) <= 300),

  -- Groups can be culled. One row carrying the count, as everywhere else.
  animals_count integer check (animals_count is null or animals_count > 0),

  carcass_disposal text check (carcass_disposal is null or char_length(carcass_disposal) <= 500),

  performed_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1 check (server_version > 0),
  created_by_device_id uuid references public.vet_devices(id) on delete set null,
  last_modified_by_device_id uuid references public.vet_devices(id) on delete set null,

  -- An injection needs to say what was given. A captive bolt does not.
  check (method <> 'injectable' or agent is not null),
  -- Confirmed by whom, if confirmed at all.
  check (death_confirmed = false or death_confirmed_by is not null)
);

-- An animal is euthanised once. A second record against the same patient is a
-- mistake, not a second death.
create unique index if not exists euthanasia_one_per_patient_idx
  on public.euthanasia_records (patient_id) where deleted_at is null;

create index if not exists euthanasia_visit_idx on public.euthanasia_records (visit_id);

alter table public.euthanasia_records enable row level security;

drop policy if exists euthanasia_records_select_own on public.euthanasia_records;
create policy euthanasia_records_select_own on public.euthanasia_records
  for select using (
    vet_id = app_private.current_vet_id()
    and (auth.jwt() ->> 'aal') = 'aal2'
  );

revoke all on public.euthanasia_records from anon, authenticated;
grant select on public.euthanasia_records to authenticated;

create or replace function app_private.enforce_euthanasia_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_visit_vet uuid;
  v_visit_patient uuid;
begin
  select vet_id, patient_id into v_visit_vet, v_visit_patient
  from public.visits where id = new.visit_id;

  if v_visit_vet is null or v_visit_vet <> new.vet_id then
    raise exception 'Consultation belongs to another practice' using errcode = '42501';
  end if;

  if v_visit_patient <> new.patient_id then
    raise exception 'Euthanasia does not belong to this animal' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists euthanasia_tenant_guard on public.euthanasia_records;
create trigger euthanasia_tenant_guard
  before insert or update on public.euthanasia_records
  for each row execute function app_private.enforce_euthanasia_tenant();

drop trigger if exists euthanasia_set_row_version on public.euthanasia_records;
create trigger euthanasia_set_row_version
  before update on public.euthanasia_records
  for each row execute function app_private.set_row_version();

comment on table public.euthanasia_records is
  'The end of a folder: why, how, whether death was confirmed, and what became '
  'of the carcass. One per animal.';

-- ---------------------------------------------------------------------------
-- Consent gains its second subject
-- ---------------------------------------------------------------------------

alter table public.consents
  add column if not exists euthanasia_record_id uuid
    references public.euthanasia_records(id) on delete restrict;

alter table public.consents
  drop constraint if exists consents_euthanasia_target_check;

alter table public.consents
  add constraint consents_euthanasia_target_check check (
    consent_for <> 'euthanasia' or euthanasia_record_id is not null
  );

create index if not exists consents_euthanasia_idx
  on public.consents (euthanasia_record_id) where euthanasia_record_id is not null;

-- The immutability trigger must cover the new column too, or a consent could
-- be moved from one death to another after the fact. Reproduced with that one
-- column added; every other comparison is as it was.
create or replace function app_private.enforce_consent_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.consent_for is distinct from old.consent_for
    or new.surgical_procedure_id is distinct from old.surgical_procedure_id
    or new.euthanasia_record_id is distinct from old.euthanasia_record_id
    or new.granted_by_name is distinct from old.granted_by_name
    or new.granted_by_capacity is distinct from old.granted_by_capacity
    or new.method is distinct from old.method
    or new.witness_name is distinct from old.witness_name
    or new.risks_explained is distinct from old.risks_explained
    or new.granted_at is distinct from old.granted_at
    or new.visit_id is distinct from old.visit_id
    or new.vet_id is distinct from old.vet_id
  then
    raise exception 'A consent record cannot be altered once given' using errcode = '42501';
  end if;

  if old.withdrawn_at is not null
    and (new.withdrawn_at is distinct from old.withdrawn_at
         or new.withdrawal_reason is distinct from old.withdrawal_reason)
  then
    raise exception 'A withdrawal cannot be altered once recorded' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- record_consent gains the euthanasia target. The old signature is dropped
-- rather than left as an overload.
drop function if exists public.record_consent(
  uuid, uuid, text, text, text, text, text, uuid, text, uuid
);

create or replace function public.record_consent(
  p_id uuid,
  p_visit_id uuid,
  p_consent_for text,
  p_granted_by_name text,
  p_granted_by_capacity text,
  p_method text,
  p_risks_explained text,
  p_surgical_procedure_id uuid default null,
  p_witness_name text default null,
  p_device_id uuid default null,
  p_euthanasia_record_id uuid default null
)
returns uuid
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
    raise exception 'Consultation not found' using errcode = 'P0002';
  end if;

  if v_status <> 'draft' then
    raise exception 'This record is signed and cannot take new entries' using errcode = '42501';
  end if;

  if p_consent_for not in ('surgery', 'euthanasia') then
    raise exception 'Invalid consent subject' using errcode = '22023';
  end if;

  if p_granted_by_capacity not in ('owner', 'authorised_agent', 'keeper') then
    raise exception 'Invalid capacity' using errcode = '22023';
  end if;

  if p_method not in ('written', 'verbal', 'verbal_witnessed') then
    raise exception 'Invalid consent method' using errcode = '22023';
  end if;

  if p_method = 'verbal_witnessed' and nullif(trim(coalesce(p_witness_name, '')), '') is null then
    raise exception 'A witnessed consent needs the witness named' using errcode = '22023';
  end if;

  if char_length(trim(coalesce(p_risks_explained, ''))) < 10 then
    raise exception 'Record what was explained to them' using errcode = '22023';
  end if;

  if p_consent_for = 'surgery' and p_surgical_procedure_id is null then
    raise exception 'A surgical consent names the procedure it is for' using errcode = '22023';
  end if;

  if p_consent_for = 'euthanasia' and p_euthanasia_record_id is null then
    raise exception 'A euthanasia consent names the record it is for' using errcode = '22023';
  end if;

  insert into public.consents (
    id, vet_id, visit_id, consent_for, surgical_procedure_id, euthanasia_record_id,
    granted_by_name, granted_by_capacity, method, witness_name, risks_explained,
    created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, p_visit_id, p_consent_for, p_surgical_procedure_id, p_euthanasia_record_id,
    trim(p_granted_by_name), p_granted_by_capacity, p_method,
    nullif(trim(p_witness_name), ''), trim(p_risks_explained),
    p_device_id, p_device_id
  )
  on conflict (id) do nothing;

  if not found then
    if exists (select 1 from public.consents where id = p_id and vet_id = v_vet_id) then
      return p_id;
    end if;
    raise exception 'Consent ID is unavailable' using errcode = '42501';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'consent.recorded', 'consent', p_id, null,
    jsonb_build_object(
      'visit_id', p_visit_id,
      'consent_for', p_consent_for,
      'capacity', p_granted_by_capacity,
      'method', p_method
    )
  );

  return p_id;
end;
$$;

revoke all on function public.record_consent(
  uuid, uuid, text, text, text, text, text, uuid, text, uuid, uuid
) from public;
grant execute on function public.record_consent(
  uuid, uuid, text, text, text, text, text, uuid, text, uuid, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- Recording one
-- ---------------------------------------------------------------------------

create or replace function public.record_euthanasia(
  p_id uuid,
  p_visit_id uuid,
  p_reason text,
  p_reason_detail text,
  p_method text,
  p_agent text default null,
  p_death_confirmed boolean default false,
  p_death_confirmed_by text default null,
  p_animals_count integer default null,
  p_carcass_disposal text default null,
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
  v_status text;
  v_kind text;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  select v.patient_id, v.workflow_status, p.kind
    into v_patient_id, v_status, v_kind
  from public.visits v
  join public.patients p on p.id = v.patient_id
  where v.id = p_visit_id and v.vet_id = v_vet_id and v.deleted_at is null;

  if v_patient_id is null then
    raise exception 'Consultation not found' using errcode = 'P0002';
  end if;

  if v_status <> 'draft' then
    raise exception 'This record is signed and cannot take new entries' using errcode = '42501';
  end if;

  if p_reason not in ('suffering', 'poor_prognosis', 'owner_request', 'financial', 'food_safety', 'dangerous', 'other') then
    raise exception 'Invalid reason' using errcode = '22023';
  end if;

  if p_method not in ('injectable', 'captive_bolt', 'gunshot', 'other') then
    raise exception 'Invalid method' using errcode = '22023';
  end if;

  if char_length(trim(coalesce(p_reason_detail, ''))) < 10 then
    raise exception 'Say why, in your own words' using errcode = '22023';
  end if;

  if p_method = 'injectable' and nullif(trim(coalesce(p_agent, '')), '') is null then
    raise exception 'Record what was given' using errcode = '22023';
  end if;

  if p_death_confirmed and nullif(trim(coalesce(p_death_confirmed_by, '')), '') is null then
    raise exception 'Say how death was confirmed' using errcode = '22023';
  end if;

  if v_kind <> 'group' and p_animals_count is not null then
    raise exception 'A count belongs to a group folder' using errcode = '22023';
  end if;

  -- Checked before the insert, not after. `on conflict (id) do nothing` only
  -- covers the primary key, so a second record under a different id hits the
  -- one-per-patient index and surfaces as 23505 with a constraint name the vet
  -- cannot read. The replay case — the same id sent twice — is still handled
  -- below, and is a different thing entirely.
  if p_id is distinct from (
    select id from public.euthanasia_records
    where patient_id = v_patient_id and vet_id = v_vet_id and deleted_at is null
  ) and exists (
    select 1 from public.euthanasia_records
    where patient_id = v_patient_id and vet_id = v_vet_id and deleted_at is null
  ) then
    raise exception 'This animal is already recorded as euthanised' using errcode = '22023';
  end if;

  insert into public.euthanasia_records (
    id, vet_id, visit_id, patient_id, reason, reason_detail, method, agent,
    death_confirmed, death_confirmed_by, animals_count, carcass_disposal,
    created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, p_visit_id, v_patient_id, p_reason, trim(p_reason_detail),
    p_method, nullif(trim(p_agent), ''),
    coalesce(p_death_confirmed, false), nullif(trim(p_death_confirmed_by), ''),
    p_animals_count, nullif(trim(p_carcass_disposal), ''),
    p_device_id, p_device_id
  )
  on conflict (id) do nothing;

  if not found then
    if exists (select 1 from public.euthanasia_records where id = p_id and vet_id = v_vet_id) then
      return p_id;
    end if;
    -- The unique index refuses a second death for the same animal, which
    -- surfaces here rather than as a constraint name the vet cannot read.
    if exists (
      select 1 from public.euthanasia_records
      where patient_id = v_patient_id and vet_id = v_vet_id and deleted_at is null
    ) then
      raise exception 'This animal is already recorded as euthanised' using errcode = '22023';
    end if;
    raise exception 'Euthanasia ID is unavailable' using errcode = '42501';
  end if;

  -- The folder ends here. A folder whose animal was euthanised must not still
  -- read active, because the next person to open it will treat it as a live
  -- case. Same transaction: the death and the status are one fact.
  --
  -- deceased_at is set from the record rather than from now(). The patients
  -- table already refuses a deceased animal with no date of death — a check
  -- that predates this feature and was right to be there — and taking the date
  -- from the euthanasia itself keeps the two from disagreeing by a few
  -- microseconds, or by a day if the act is ever backdated.
  update public.patients
  set status = 'deceased',
      deceased_at = (select performed_at from public.euthanasia_records where id = p_id)
  where id = v_patient_id and vet_id = v_vet_id;

  perform app_private.insert_audit_event(
    v_vet_id, 'euthanasia.recorded', 'euthanasia', p_id, trim(p_reason_detail),
    jsonb_build_object(
      'visit_id', p_visit_id,
      'patient_id', v_patient_id,
      'reason', p_reason,
      'method', p_method,
      'death_confirmed', coalesce(p_death_confirmed, false)
    )
  );

  return p_id;
end;
$$;

revoke all on function public.record_euthanasia(
  uuid, uuid, text, text, text, text, boolean, text, integer, text, uuid
) from public;
grant execute on function public.record_euthanasia(
  uuid, uuid, text, text, text, text, boolean, text, integer, text, uuid
) to authenticated;
