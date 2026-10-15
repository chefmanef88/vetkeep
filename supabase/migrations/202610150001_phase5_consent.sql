-- Consent: who agreed, to what, having been told what.
--
-- This is the one record in the application whose whole value is that it cannot
-- be rewritten afterwards. A consent you can edit is not evidence of anything —
-- it is a note saying consent was given, written by the only person with an
-- interest in saying so. So the substance is immutable from the moment it is
-- recorded, enforced by a trigger rather than by convention.
--
-- Four decisions worth stating.
--
-- The person present is not always the owner. A herdsman holds the animal, a
-- son brings the dog, a manager runs the farm — and whether they could consent
-- at all is exactly what a dispute turns on. So the capacity is recorded, not
-- assumed from the client on the folder.
--
-- Consent in this setting is usually spoken. A kraal at dusk is not a place
-- where a form gets signed, and offering only "written" would make the vet
-- either lie or skip the record. Verbal is a first-class method; verbal with a
-- witness is better and is recorded as such, and a witnessed consent must name
-- its witness.
--
-- What the owner was told is the substance, so risks_explained is not
-- nullable. A consent record that does not say what was explained is a
-- signature on a blank page.
--
-- And a missing consent does not block the procedure. It is tempting to refuse
-- surgery until consent exists, but a vet mid-caesarean will not stop to type,
-- and a system that blocks gets one of two things: a fabricated consent, or no
-- record of the surgery at all. Both are worse than a record that says plainly
-- that consent was not captured. The gap is shown, not prevented.

create table if not exists public.consents (
  id uuid primary key,
  vet_id uuid not null references public.vets(id) on delete restrict,
  visit_id uuid not null references public.visits(id) on delete restrict,

  -- One target, in the shape client_reminders already uses. Euthanasia joins
  -- this list when it exists; the discriminator is here so the column can be
  -- added without reshaping the table.
  consent_for text not null check (consent_for in ('surgery', 'euthanasia')),
  surgical_procedure_id uuid references public.surgical_procedures(id) on delete restrict,

  granted_by_name text not null
    check (char_length(trim(granted_by_name)) between 2 and 160),
  -- Not inferred from the folder's client. Whether this person could consent
  -- is the question a dispute actually turns on.
  granted_by_capacity text not null
    check (granted_by_capacity in ('owner', 'authorised_agent', 'keeper')),

  method text not null check (method in ('written', 'verbal', 'verbal_witnessed')),
  witness_name text check (witness_name is null or char_length(trim(witness_name)) between 2 and 160),

  -- The substance. Not nullable, because a consent that does not say what was
  -- explained records nothing worth having.
  risks_explained text not null
    check (char_length(trim(risks_explained)) between 10 and 4000),

  granted_at timestamptz not null default now(),

  -- Withdrawal is a new fact, not an edit. The original stands beside it.
  withdrawn_at timestamptz,
  withdrawal_reason text check (withdrawal_reason is null or char_length(withdrawal_reason) <= 1000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_version bigint not null default 1 check (server_version > 0),
  created_by_device_id uuid references public.vet_devices(id) on delete set null,
  last_modified_by_device_id uuid references public.vet_devices(id) on delete set null,

  -- A witnessed consent names its witness, or it is simply a verbal one.
  check (method <> 'verbal_witnessed' or witness_name is not null),
  -- A surgical consent points at the procedure it is for.
  check (consent_for <> 'surgery' or surgical_procedure_id is not null),
  -- Withdrawal carries its reason, for the same purpose the consent carries
  -- what was explained.
  check (withdrawn_at is null or withdrawal_reason is not null)
);

create index if not exists consents_visit_idx on public.consents (visit_id);
create index if not exists consents_procedure_idx on public.consents (surgical_procedure_id)
  where surgical_procedure_id is not null;

alter table public.consents enable row level security;

drop policy if exists consents_select_own on public.consents;
create policy consents_select_own on public.consents
  for select using (
    vet_id = app_private.current_vet_id()
    and (auth.jwt() ->> 'aal') = 'aal2'
  );

-- Revoked before granting. The default ACL on this database hands new tables
-- TRUNCATE, which RLS does not cover — and of every table in this schema, the
-- one holding consent is the worst to leave emptiable.
revoke all on public.consents from anon, authenticated;
grant select on public.consents to authenticated;

-- ---------------------------------------------------------------------------
-- Immutability
-- ---------------------------------------------------------------------------

create or replace function app_private.enforce_consent_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Everything that describes the agreement is fixed once written. Only the
  -- withdrawal columns may change, and only from null — a withdrawal cannot
  -- itself be rewritten or undone.
  if new.consent_for is distinct from old.consent_for
    or new.surgical_procedure_id is distinct from old.surgical_procedure_id
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

drop trigger if exists consents_immutable on public.consents;
create trigger consents_immutable
  before update on public.consents
  for each row execute function app_private.enforce_consent_immutable();

create or replace function app_private.enforce_consent_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_visit_vet uuid;
  v_proc_visit uuid;
begin
  select vet_id into v_visit_vet from public.visits where id = new.visit_id;
  if v_visit_vet is null or v_visit_vet <> new.vet_id then
    raise exception 'Consultation belongs to another practice' using errcode = '42501';
  end if;

  if new.surgical_procedure_id is not null then
    select visit_id into v_proc_visit
    from public.surgical_procedures
    where id = new.surgical_procedure_id and vet_id = new.vet_id;

    -- A consent filed against a procedure from a different consultation would
    -- pass every tenant check and still be attached to the wrong operation.
    if v_proc_visit is null or v_proc_visit <> new.visit_id then
      raise exception 'Procedure does not belong to this consultation' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists consents_tenant_guard on public.consents;
create trigger consents_tenant_guard
  before insert or update on public.consents
  for each row execute function app_private.enforce_consent_tenant();

drop trigger if exists consents_set_row_version on public.consents;
create trigger consents_set_row_version
  before update on public.consents
  for each row execute function app_private.set_row_version();

comment on table public.consents is
  'Who agreed to what, having been told what. Immutable once recorded: a '
  'withdrawal is a new fact written beside the original, never an edit.';

-- ---------------------------------------------------------------------------
-- Recording one
-- ---------------------------------------------------------------------------

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
  p_device_id uuid default null
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

  insert into public.consents (
    id, vet_id, visit_id, consent_for, surgical_procedure_id,
    granted_by_name, granted_by_capacity, method, witness_name, risks_explained,
    created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, p_visit_id, p_consent_for, p_surgical_procedure_id,
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

-- ---------------------------------------------------------------------------
-- Withdrawing one
-- ---------------------------------------------------------------------------

create or replace function public.withdraw_consent(
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
  v_withdrawn timestamptz;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  select withdrawn_at into v_withdrawn
  from public.consents
  where id = p_id and vet_id = v_vet_id;

  if not found then
    raise exception 'Consent not found' using errcode = 'P0002';
  end if;

  -- Withdrawing twice is not an error, and must not overwrite the first
  -- reason: the moment it was withdrawn is itself part of the record.
  if v_withdrawn is not null then
    return;
  end if;

  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Say why consent was withdrawn' using errcode = '22023';
  end if;

  update public.consents
  set withdrawn_at = now(),
      withdrawal_reason = trim(p_reason),
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_id and vet_id = v_vet_id;

  perform app_private.insert_audit_event(
    v_vet_id, 'consent.withdrawn', 'consent', p_id, trim(p_reason), '{}'::jsonb
  );
end;
$$;

revoke all on function public.record_consent(
  uuid, uuid, text, text, text, text, text, uuid, text, uuid
) from public;
grant execute on function public.record_consent(
  uuid, uuid, text, text, text, text, text, uuid, text, uuid
) to authenticated;

revoke all on function public.withdraw_consent(uuid, text, uuid) from public;
grant execute on function public.withdraw_consent(uuid, text, uuid) to authenticated;
