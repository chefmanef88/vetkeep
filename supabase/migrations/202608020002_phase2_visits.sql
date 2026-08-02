-- VetKeep Phase 2 clinical record: visits, physical examination, and amendments.
-- Follows the established pattern: client roles receive SELECT only and every
-- mutation runs through a controlled SECURITY DEFINER RPC. Row identifiers are
-- client-generated (offline-safe) and create RPCs are idempotent so a retried
-- offline sync cannot duplicate a medical record.
--
-- Clinical-safety rules that are enforced by the database rather than the client:
--   * A visit that has left 'draft' is a signed medical record: its clinical
--     content can never change again, and it can neither be reopened nor deleted.
--   * 'voided' is terminal. A voided visit is never reopenable.
--   * Every visit owns exactly eleven physical examination systems and each one
--     starts as 'not_examined'. A system is NEVER defaulted to 'normal'; a normal
--     finding always means the veterinarian deliberately examined that system.
--   * Examination findings are editable only while the parent visit is a draft.
--   * Amendments are append-only and only ever attach to a completed visit.
--   * A child row whose vet_id differs from its parent visit is rejected (brief 9.3).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.visits (
  id uuid primary key,
  vet_id uuid not null references public.vets(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  appointment_id uuid,
  visit_date timestamptz not null,
  visit_type text not null
    check (visit_type in ('home_call', 'clinic_visit', 'field_visit', 'emergency', 'follow_up', 'teleconsult')),
  workflow_status text not null default 'draft'
    check (workflow_status in ('draft', 'completed', 'voided')),

  chief_complaint text check (chief_complaint is null or char_length(chief_complaint) <= 2000),
  history_of_complaint text check (history_of_complaint is null or char_length(history_of_complaint) <= 4000),
  past_medical_history text check (past_medical_history is null or char_length(past_medical_history) <= 4000),
  current_medications text check (current_medications is null or char_length(current_medications) <= 2000),

  temperature_c numeric(4,1),
  heart_rate_bpm integer,
  respiratory_rate_bpm integer,
  weight_value numeric(8,2),
  weight_unit text not null default 'kg' check (weight_unit in ('kg', 'g')),
  body_condition_score text check (body_condition_score is null or char_length(body_condition_score) <= 40),
  pain_score text check (pain_score is null or char_length(pain_score) <= 40),

  problem_list text check (problem_list is null or char_length(problem_list) <= 4000),
  differential_diagnoses text check (differential_diagnoses is null or char_length(differential_diagnoses) <= 4000),
  tentative_diagnosis text check (tentative_diagnosis is null or char_length(tentative_diagnosis) <= 2000),
  definitive_diagnosis text check (definitive_diagnosis is null or char_length(definitive_diagnosis) <= 2000),

  treatment_plan text check (treatment_plan is null or char_length(treatment_plan) <= 4000),
  prescriptions text check (prescriptions is null or char_length(prescriptions) <= 4000),
  follow_up_plan text check (follow_up_plan is null or char_length(follow_up_plan) <= 2000),
  next_review_date date,

  signed_at timestamptz,
  completed_at timestamptz,
  voided_at timestamptz,
  void_reason text check (void_reason is null or char_length(trim(void_reason)) between 3 and 500),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1 check (server_version > 0),
  created_by_device_id uuid references public.vet_devices(id) on delete set null,
  last_modified_by_device_id uuid references public.vet_devices(id) on delete set null,

  check (temperature_c is null or temperature_c between 20 and 50),
  check (heart_rate_bpm is null or heart_rate_bpm > 0),
  check (respiratory_rate_bpm is null or respiratory_rate_bpm > 0),
  check (weight_value is null or weight_value > 0),
  check (
    (workflow_status = 'completed' and signed_at is not null and completed_at is not null)
    or workflow_status <> 'completed'
  ),
  check (
    (workflow_status = 'voided' and void_reason is not null and voided_at is not null)
    or workflow_status <> 'voided'
  )
);

-- Examination rows are derived from the visit, so the server generates their
-- identifiers; clients address them by (visit_id, system_name) instead.
create table public.physical_exam_findings (
  id uuid primary key default gen_random_uuid(),
  vet_id uuid not null references public.vets(id) on delete restrict,
  visit_id uuid not null references public.visits(id) on delete restrict,
  system_name text not null check (system_name in (
    'General', 'Cardiovascular', 'Respiratory', 'Gastrointestinal', 'Musculoskeletal',
    'Integumentary', 'Neurological', 'Ocular', 'Aural', 'Urogenital', 'Lymphatic'
  )),
  status text not null default 'not_examined'
    check (status in ('not_examined', 'normal', 'abnormal', 'not_applicable')),
  remarks text check (remarks is null or char_length(remarks) <= 2000),
  examined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1 check (server_version > 0),
  created_by_device_id uuid references public.vet_devices(id) on delete set null,
  last_modified_by_device_id uuid references public.vet_devices(id) on delete set null,
  unique (visit_id, system_name),
  check (status = 'not_examined' or examined_at is not null)
);

-- Amendments never overwrite the signed record, so this table carries no
-- updated_at, deleted_at, or last_modified_by_device_id: it is append-only in
-- exactly the same way as public.audit_events.
create table public.visit_amendments (
  id uuid primary key,
  vet_id uuid not null references public.vets(id) on delete restrict,
  visit_id uuid not null references public.visits(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  amendment_text text not null check (char_length(trim(amendment_text)) between 3 and 8000),
  structured_changes jsonb not null default '{}'::jsonb,
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  server_version bigint not null default 1 check (server_version > 0),
  created_by_device_id uuid references public.vet_devices(id) on delete set null,
  check (jsonb_typeof(structured_changes) = 'object'),
  check (octet_length(structured_changes::text) <= 8192)
);

comment on table public.visits is
  'Clinical visit record. A visit that has left draft is a signed medical record: its clinical content is immutable and it cannot be reopened or deleted.';
comment on table public.physical_exam_findings is
  'Eleven-system physical examination checklist. Every system starts as not_examined; a system is never defaulted to normal.';
comment on table public.visit_amendments is
  'Append-only clarifications and corrections attached to a completed visit. Never store the amended value in place of the original.';

create index visits_vet_id_idx on public.visits (vet_id) where deleted_at is null;
create index visits_patient_date_idx on public.visits (patient_id, visit_date desc) where deleted_at is null;
create index visits_vet_date_idx on public.visits (vet_id, visit_date desc) where deleted_at is null;
create index visits_vet_status_idx on public.visits (vet_id, workflow_status) where deleted_at is null;
create index visits_appointment_idx on public.visits (appointment_id) where appointment_id is not null;

create index physical_exam_findings_visit_idx on public.physical_exam_findings (visit_id);
create index physical_exam_findings_vet_id_idx on public.physical_exam_findings (vet_id);
create index physical_exam_findings_pending_idx
  on public.physical_exam_findings (visit_id)
  where status = 'not_examined' and deleted_at is null;

create index visit_amendments_visit_idx on public.visit_amendments (visit_id, created_at);
create index visit_amendments_vet_id_idx on public.visit_amendments (vet_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

-- The canonical eleven systems. Kept as a function so the seeding RPC and the
-- validation RPCs can never drift apart; the table CHECK repeats the list
-- literally so the constraint stays dump-safe.
create or replace function app_private.exam_system_names()
returns text[]
language sql
immutable
set search_path = pg_catalog
as $$
  select array[
    'General',
    'Cardiovascular',
    'Respiratory',
    'Gastrointestinal',
    'Musculoskeletal',
    'Integumentary',
    'Neurological',
    'Ocular',
    'Aural',
    'Urogenital',
    'Lymphatic'
  ]::text[]
$$;

-- Brief 9.3: a visit may only reference a patient owned by the same tenant.
create or replace function app_private.enforce_visit_patient_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_patient_vet_id uuid;
begin
  select p.vet_id into v_patient_vet_id
  from public.patients p
  where p.id = new.patient_id;

  if v_patient_vet_id is null then
    raise exception 'Patient not found' using errcode = 'P0002';
  end if;

  if v_patient_vet_id <> new.vet_id then
    raise exception 'Visit tenant does not match the patient tenant' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Brief 9.3: a child row must belong to the same tenant as its parent visit.
create or replace function app_private.enforce_visit_child_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_parent_vet_id uuid;
begin
  if tg_op = 'UPDATE' then
    if old.vet_id is distinct from new.vet_id or old.visit_id is distinct from new.visit_id then
      raise exception 'Child record ownership cannot change' using errcode = '42501';
    end if;
  end if;

  select v.vet_id into v_parent_vet_id
  from public.visits v
  where v.id = new.visit_id;

  if v_parent_vet_id is null then
    raise exception 'Visit not found' using errcode = 'P0002';
  end if;

  if v_parent_vet_id <> new.vet_id then
    raise exception 'Child record tenant does not match the parent visit' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Brief 7.1 and 7.2: once a visit leaves draft it is a signed medical record.
create or replace function app_private.enforce_visit_record_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.id is distinct from new.id
     or old.vet_id is distinct from new.vet_id
     or old.created_at is distinct from new.created_at
     or old.created_by_device_id is distinct from new.created_by_device_id then
    raise exception 'Visit identity, ownership, and provenance cannot change' using errcode = '42501';
  end if;

  if old.workflow_status = 'voided' and new.workflow_status is distinct from 'voided' then
    raise exception 'A voided visit cannot be reopened' using errcode = '42501';
  end if;

  if old.workflow_status = 'completed' and new.workflow_status = 'draft' then
    raise exception 'A completed visit cannot be reopened' using errcode = '42501';
  end if;

  -- The void record is written exactly once, by the transition into 'voided'.
  -- Outside that transition it can never be written, rewritten, or cleared.
  if old.workflow_status <> 'draft'
     and new.workflow_status is not distinct from old.workflow_status
     and (old.voided_at is distinct from new.voided_at
          or old.void_reason is distinct from new.void_reason) then
    raise exception 'The void record of a visit cannot be changed' using errcode = '42501';
  end if;

  if old.workflow_status <> 'draft' then
    if old.deleted_at is distinct from new.deleted_at then
      raise exception 'A visit that has left draft cannot be deleted' using errcode = '42501';
    end if;

    if row(
         old.patient_id,
         old.appointment_id,
         old.visit_date,
         old.visit_type,
         old.chief_complaint,
         old.history_of_complaint,
         old.past_medical_history,
         old.current_medications,
         old.temperature_c,
         old.heart_rate_bpm,
         old.respiratory_rate_bpm,
         old.weight_value,
         old.weight_unit,
         old.body_condition_score,
         old.pain_score,
         old.problem_list,
         old.differential_diagnoses,
         old.tentative_diagnosis,
         old.definitive_diagnosis,
         old.treatment_plan,
         old.prescriptions,
         old.follow_up_plan,
         old.next_review_date,
         old.signed_at,
         old.completed_at
       ) is distinct from row(
         new.patient_id,
         new.appointment_id,
         new.visit_date,
         new.visit_type,
         new.chief_complaint,
         new.history_of_complaint,
         new.past_medical_history,
         new.current_medications,
         new.temperature_c,
         new.heart_rate_bpm,
         new.respiratory_rate_bpm,
         new.weight_value,
         new.weight_unit,
         new.body_condition_score,
         new.pain_score,
         new.problem_list,
         new.differential_diagnoses,
         new.tentative_diagnosis,
         new.definitive_diagnosis,
         new.treatment_plan,
         new.prescriptions,
         new.follow_up_plan,
         new.next_review_date,
         new.signed_at,
         new.completed_at
       ) then
      raise exception 'Clinical content of a visit that has left draft cannot be changed' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create or replace function app_private.prevent_non_draft_visit_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.workflow_status <> 'draft' then
    raise exception 'A visit that has left draft cannot be deleted' using errcode = '42501';
  end if;

  return old;
end;
$$;

-- Brief 7.3: examination findings remain editable only until the visit is completed.
create or replace function app_private.require_draft_visit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_visit_id uuid;
  v_status text;
begin
  if tg_op = 'DELETE' then
    v_visit_id := old.visit_id;
  else
    v_visit_id := new.visit_id;
  end if;

  select v.workflow_status into v_status
  from public.visits v
  where v.id = v_visit_id;

  if v_status is null then
    raise exception 'Visit not found' using errcode = 'P0002';
  end if;

  if v_status <> 'draft' then
    raise exception 'Examination findings can only change while the visit is a draft' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

-- Brief 7.4: an amendment only ever attaches to a completed visit.
create or replace function app_private.require_completed_visit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text;
begin
  select v.workflow_status into v_status
  from public.visits v
  where v.id = new.visit_id;

  if v_status is null then
    raise exception 'Visit not found' using errcode = 'P0002';
  end if;

  if v_status <> 'completed' then
    raise exception 'Amendments are only allowed on a completed visit' using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function app_private.prevent_amendment_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'visit_amendments is append-only' using errcode = '42501';
end;
$$;

-- Trigger names are chosen so that tenant checks always fire before workflow
-- checks, and row versioning always fires last.
create trigger visits_enforce_patient_tenant
before insert or update on public.visits
for each row execute function app_private.enforce_visit_patient_tenant();

create trigger visits_enforce_record_integrity
before update on public.visits
for each row execute function app_private.enforce_visit_record_integrity();

create trigger visits_prevent_non_draft_delete
before delete on public.visits
for each row execute function app_private.prevent_non_draft_visit_delete();

create trigger visits_set_row_version
before update on public.visits
for each row execute function app_private.set_row_version();

create trigger physical_exam_findings_enforce_tenant
before insert or update on public.physical_exam_findings
for each row execute function app_private.enforce_visit_child_tenant();

create trigger physical_exam_findings_require_draft_visit
before insert or update or delete on public.physical_exam_findings
for each row execute function app_private.require_draft_visit();

create trigger physical_exam_findings_set_row_version
before update on public.physical_exam_findings
for each row execute function app_private.set_row_version();

create trigger visit_amendments_enforce_tenant
before insert on public.visit_amendments
for each row execute function app_private.enforce_visit_child_tenant();

create trigger visit_amendments_immutable
before update or delete on public.visit_amendments
for each row execute function app_private.prevent_amendment_mutation();

create trigger visit_amendments_require_completed_visit
before insert on public.visit_amendments
for each row execute function app_private.require_completed_visit();

-- ---------------------------------------------------------------------------
-- Visits
-- ---------------------------------------------------------------------------

create or replace function public.create_visit(
  p_id uuid,
  p_patient_id uuid,
  p_visit_date timestamptz,
  p_visit_type text,
  p_appointment_id uuid default null,
  p_chief_complaint text default null,
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

  if p_visit_date is null then
    raise exception 'Visit date is required' using errcode = '22023';
  end if;

  if p_visit_type not in ('home_call', 'clinic_visit', 'field_visit', 'emergency', 'follow_up', 'teleconsult') then
    raise exception 'Invalid visit type' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.patients
    where id = p_patient_id and vet_id = v_vet_id and deleted_at is null
  ) then
    raise exception 'Patient not found' using errcode = 'P0002';
  end if;

  insert into public.visits (
    id, vet_id, patient_id, appointment_id, visit_date, visit_type,
    workflow_status, chief_complaint,
    created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, p_patient_id, p_appointment_id, p_visit_date, p_visit_type,
    'draft', nullif(trim(p_chief_complaint), ''),
    p_device_id, p_device_id
  )
  on conflict (id) do nothing;

  if not found then
    if exists (select 1 from public.visits where id = p_id and vet_id = v_vet_id) then
      perform app_private.insert_audit_event(
        v_vet_id, 'visit.created', 'visit', p_id, null,
        jsonb_build_object('idempotent_retry', true)
      );
      return p_id;
    end if;
    raise exception 'Visit ID is unavailable' using errcode = '42501';
  end if;

  -- Brief 7.3: seed the eleven-system checklist. Every system starts as
  -- 'not_examined' so that a normal finding can only ever be a deliberate act.
  insert into public.physical_exam_findings (
    vet_id, visit_id, system_name, status,
    created_by_device_id, last_modified_by_device_id
  )
  select v_vet_id, p_id, s.system_name, 'not_examined', p_device_id, p_device_id
  from unnest(app_private.exam_system_names()) as s(system_name)
  on conflict (visit_id, system_name) do nothing;

  perform app_private.insert_audit_event(
    v_vet_id, 'visit.created', 'visit', p_id, null,
    jsonb_build_object('patient_id', p_patient_id, 'visit_type', p_visit_type)
  );

  return p_id;
end;
$$;

create or replace function public.update_visit_draft(
  p_id uuid,
  p_visit_date timestamptz,
  p_visit_type text,
  p_chief_complaint text default null,
  p_history_of_complaint text default null,
  p_past_medical_history text default null,
  p_current_medications text default null,
  p_temperature_c numeric default null,
  p_heart_rate_bpm integer default null,
  p_respiratory_rate_bpm integer default null,
  p_weight_value numeric default null,
  p_weight_unit text default 'kg',
  p_body_condition_score text default null,
  p_pain_score text default null,
  p_problem_list text default null,
  p_differential_diagnoses text default null,
  p_tentative_diagnosis text default null,
  p_definitive_diagnosis text default null,
  p_treatment_plan text default null,
  p_prescriptions text default null,
  p_follow_up_plan text default null,
  p_next_review_date date default null,
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
  where id = p_id and vet_id = v_vet_id and deleted_at is null;

  if v_status is null then
    raise exception 'Visit not found' using errcode = 'P0002';
  end if;

  if v_status <> 'draft' then
    raise exception 'Only draft visits can be edited' using errcode = '42501';
  end if;

  if p_visit_date is null then
    raise exception 'Visit date is required' using errcode = '22023';
  end if;

  if p_visit_type not in ('home_call', 'clinic_visit', 'field_visit', 'emergency', 'follow_up', 'teleconsult') then
    raise exception 'Invalid visit type' using errcode = '22023';
  end if;

  if coalesce(p_weight_unit, 'kg') not in ('kg', 'g') then
    raise exception 'Invalid weight unit' using errcode = '22023';
  end if;

  if p_temperature_c is not null and p_temperature_c not between 20 and 50 then
    raise exception 'Invalid temperature reading' using errcode = '22023';
  end if;

  if p_heart_rate_bpm is not null and p_heart_rate_bpm <= 0 then
    raise exception 'Invalid heart rate' using errcode = '22023';
  end if;

  if p_respiratory_rate_bpm is not null and p_respiratory_rate_bpm <= 0 then
    raise exception 'Invalid respiratory rate' using errcode = '22023';
  end if;

  if p_weight_value is not null and p_weight_value <= 0 then
    raise exception 'Invalid weight value' using errcode = '22023';
  end if;

  update public.visits
  set visit_date = p_visit_date,
      visit_type = p_visit_type,
      chief_complaint = nullif(trim(p_chief_complaint), ''),
      history_of_complaint = nullif(trim(p_history_of_complaint), ''),
      past_medical_history = nullif(trim(p_past_medical_history), ''),
      current_medications = nullif(trim(p_current_medications), ''),
      temperature_c = p_temperature_c,
      heart_rate_bpm = p_heart_rate_bpm,
      respiratory_rate_bpm = p_respiratory_rate_bpm,
      weight_value = p_weight_value,
      weight_unit = coalesce(p_weight_unit, 'kg'),
      body_condition_score = nullif(trim(p_body_condition_score), ''),
      pain_score = nullif(trim(p_pain_score), ''),
      problem_list = nullif(trim(p_problem_list), ''),
      differential_diagnoses = nullif(trim(p_differential_diagnoses), ''),
      tentative_diagnosis = nullif(trim(p_tentative_diagnosis), ''),
      definitive_diagnosis = nullif(trim(p_definitive_diagnosis), ''),
      treatment_plan = nullif(trim(p_treatment_plan), ''),
      prescriptions = nullif(trim(p_prescriptions), ''),
      follow_up_plan = nullif(trim(p_follow_up_plan), ''),
      next_review_date = p_next_review_date,
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_id and vet_id = v_vet_id and workflow_status = 'draft' and deleted_at is null;

  if not found then
    raise exception 'Visit not found' using errcode = 'P0002';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'visit.draft_updated', 'visit', p_id, null, '{}'::jsonb
  );
end;
$$;

create or replace function public.complete_visit(
  p_visit_id uuid,
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
  v_pending integer;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  select workflow_status into v_status
  from public.visits
  where id = p_visit_id and vet_id = v_vet_id and deleted_at is null;

  if v_status is null then
    raise exception 'Visit not found' using errcode = 'P0002';
  end if;

  -- A retried offline sync must not fail on an already-signed record.
  if v_status = 'completed' then
    perform app_private.insert_audit_event(
      v_vet_id, 'visit.completed', 'visit', p_visit_id, null,
      jsonb_build_object('idempotent_retry', true)
    );
    return;
  end if;

  if v_status <> 'draft' then
    raise exception 'Only draft visits can be completed' using errcode = '42501';
  end if;

  select count(*)::integer into v_pending
  from public.physical_exam_findings
  where visit_id = p_visit_id and vet_id = v_vet_id
    and status = 'not_examined' and deleted_at is null;

  update public.visits
  set workflow_status = 'completed',
      signed_at = now(),
      completed_at = now(),
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_visit_id and vet_id = v_vet_id and workflow_status = 'draft' and deleted_at is null;

  if not found then
    raise exception 'Visit not found' using errcode = 'P0002';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'visit.completed', 'visit', p_visit_id, null,
    jsonb_build_object('systems_not_examined', v_pending)
  );
end;
$$;

create or replace function public.void_visit(
  p_visit_id uuid,
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
  v_status text;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  if p_reason is null or char_length(trim(p_reason)) < 3 then
    raise exception 'Void reason is required' using errcode = '22023';
  end if;

  if char_length(trim(p_reason)) > 500 then
    raise exception 'Void reason is too long' using errcode = '22023';
  end if;

  select workflow_status into v_status
  from public.visits
  where id = p_visit_id and vet_id = v_vet_id and deleted_at is null;

  if v_status is null then
    raise exception 'Visit not found' using errcode = 'P0002';
  end if;

  -- Voiding is terminal and idempotent; the original reason is never rewritten.
  if v_status = 'voided' then
    perform app_private.insert_audit_event(
      v_vet_id, 'visit.void_retried', 'visit', p_visit_id, trim(p_reason),
      jsonb_build_object('idempotent_retry', true)
    );
    return;
  end if;

  update public.visits
  set workflow_status = 'voided',
      voided_at = now(),
      void_reason = trim(p_reason),
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_visit_id and vet_id = v_vet_id
    and workflow_status in ('draft', 'completed') and deleted_at is null;

  if not found then
    raise exception 'Visit not found' using errcode = 'P0002';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'visit.voided', 'visit', p_visit_id, trim(p_reason),
    jsonb_build_object('previous_status', v_status)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Physical examination
-- ---------------------------------------------------------------------------

create or replace function public.set_exam_finding(
  p_visit_id uuid,
  p_system_name text,
  p_status text,
  p_remarks text default null,
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
  v_finding_id uuid;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  if p_system_name is null or not (p_system_name = any (app_private.exam_system_names())) then
    raise exception 'Invalid examination system' using errcode = '22023';
  end if;

  if p_status is null or p_status not in ('not_examined', 'normal', 'abnormal', 'not_applicable') then
    raise exception 'Invalid examination status' using errcode = '22023';
  end if;

  select workflow_status into v_status
  from public.visits
  where id = p_visit_id and vet_id = v_vet_id and deleted_at is null;

  if v_status is null then
    raise exception 'Visit not found' using errcode = 'P0002';
  end if;

  if v_status <> 'draft' then
    raise exception 'Examination findings can only change while the visit is a draft' using errcode = '42501';
  end if;

  update public.physical_exam_findings
  set status = p_status,
      remarks = nullif(trim(p_remarks), ''),
      examined_at = case when p_status = 'not_examined' then null else now() end,
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where visit_id = p_visit_id
    and vet_id = v_vet_id
    and system_name = p_system_name
    and deleted_at is null
  returning id into v_finding_id;

  if not found then
    raise exception 'Examination system not found for this visit' using errcode = 'P0002';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'visit.exam_finding_recorded', 'physical_exam_finding', v_finding_id, null,
    jsonb_build_object('visit_id', p_visit_id, 'system_name', p_system_name, 'status', p_status)
  );
end;
$$;

-- Brief 7.3: an explicit, deliberate sweep. It only ever promotes systems that
-- are still 'not_examined' and never overwrites a recorded finding.
create or replace function public.mark_remaining_systems_normal(
  p_visit_id uuid,
  p_device_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_status text;
  v_updated integer;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  select workflow_status into v_status
  from public.visits
  where id = p_visit_id and vet_id = v_vet_id and deleted_at is null;

  if v_status is null then
    raise exception 'Visit not found' using errcode = 'P0002';
  end if;

  if v_status <> 'draft' then
    raise exception 'Examination findings can only change while the visit is a draft' using errcode = '42501';
  end if;

  update public.physical_exam_findings
  set status = 'normal',
      examined_at = now(),
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where visit_id = p_visit_id
    and vet_id = v_vet_id
    and status = 'not_examined'
    and deleted_at is null;

  get diagnostics v_updated = row_count;

  perform app_private.insert_audit_event(
    v_vet_id, 'visit.remaining_systems_marked_normal', 'visit', p_visit_id, null,
    jsonb_build_object('systems_updated', v_updated)
  );

  return v_updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- Amendments
-- ---------------------------------------------------------------------------

create or replace function public.create_visit_amendment(
  p_id uuid,
  p_visit_id uuid,
  p_reason text,
  p_amendment_text text,
  p_structured_changes jsonb default '{}'::jsonb,
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

  if p_reason is null or char_length(trim(p_reason)) not between 3 and 500 then
    raise exception 'Amendment reason is required' using errcode = '22023';
  end if;

  if p_amendment_text is null or char_length(trim(p_amendment_text)) not between 3 and 8000 then
    raise exception 'Amendment text is required' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_structured_changes, '{}'::jsonb)) <> 'object' then
    raise exception 'Structured changes must be a JSON object' using errcode = '22023';
  end if;

  select workflow_status into v_status
  from public.visits
  where id = p_visit_id and vet_id = v_vet_id and deleted_at is null;

  if v_status is null then
    raise exception 'Visit not found' using errcode = 'P0002';
  end if;

  if v_status <> 'completed' then
    raise exception 'Amendments are only allowed on a completed visit' using errcode = '42501';
  end if;

  insert into public.visit_amendments (
    id, vet_id, visit_id, reason, amendment_text, structured_changes,
    signed_at, created_by_device_id
  ) values (
    p_id, v_vet_id, p_visit_id, trim(p_reason), trim(p_amendment_text),
    coalesce(p_structured_changes, '{}'::jsonb), now(), p_device_id
  )
  on conflict (id) do nothing;

  if not found then
    if exists (select 1 from public.visit_amendments where id = p_id and vet_id = v_vet_id) then
      perform app_private.insert_audit_event(
        v_vet_id, 'visit.amended', 'visit_amendment', p_id, null,
        jsonb_build_object('idempotent_retry', true)
      );
      return p_id;
    end if;
    raise exception 'Amendment ID is unavailable' using errcode = '42501';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'visit.amended', 'visit_amendment', p_id, trim(p_reason),
    jsonb_build_object('visit_id', p_visit_id)
  );

  return p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.visits enable row level security;
alter table public.physical_exam_findings enable row level security;
alter table public.visit_amendments enable row level security;

create policy visits_select_own
on public.visits
for select
to authenticated
using (vet_id = app_private.current_vet_id() and auth.jwt() ->> 'aal' = 'aal2');

create policy physical_exam_findings_select_own
on public.physical_exam_findings
for select
to authenticated
using (vet_id = app_private.current_vet_id() and auth.jwt() ->> 'aal' = 'aal2');

create policy visit_amendments_select_own
on public.visit_amendments
for select
to authenticated
using (vet_id = app_private.current_vet_id() and auth.jwt() ->> 'aal' = 'aal2');

revoke all on public.visits from anon, authenticated;
revoke all on public.physical_exam_findings from anon, authenticated;
revoke all on public.visit_amendments from anon, authenticated;

grant select on public.visits to authenticated;
grant select on public.physical_exam_findings to authenticated;
grant select on public.visit_amendments to authenticated;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

grant execute on function public.create_visit(uuid, uuid, timestamptz, text, uuid, text, uuid) to authenticated;
grant execute on function public.update_visit_draft(uuid, timestamptz, text, text, text, text, text, numeric, integer, integer, numeric, text, text, text, text, text, text, text, text, text, text, date, uuid) to authenticated;
grant execute on function public.complete_visit(uuid, uuid) to authenticated;
grant execute on function public.void_visit(uuid, text, uuid) to authenticated;
grant execute on function public.set_exam_finding(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.mark_remaining_systems_normal(uuid, uuid) to authenticated;
grant execute on function public.create_visit_amendment(uuid, uuid, text, text, jsonb, uuid) to authenticated;

revoke execute on function public.create_visit(uuid, uuid, timestamptz, text, uuid, text, uuid) from public, anon;
revoke execute on function public.update_visit_draft(uuid, timestamptz, text, text, text, text, text, numeric, integer, integer, numeric, text, text, text, text, text, text, text, text, text, text, date, uuid) from public, anon;
revoke execute on function public.complete_visit(uuid, uuid) from public, anon;
revoke execute on function public.void_visit(uuid, text, uuid) from public, anon;
revoke execute on function public.set_exam_finding(uuid, text, text, text, uuid) from public, anon;
revoke execute on function public.mark_remaining_systems_normal(uuid, uuid) from public, anon;
revoke execute on function public.create_visit_amendment(uuid, uuid, text, text, jsonb, uuid) from public, anon;

-- New app_private helpers default to EXECUTE for PUBLIC; close that off again and
-- restore the two helpers Phase 1 deliberately exposes to authenticated sessions.
revoke all on all functions in schema app_private from public, anon, authenticated;
grant execute on function app_private.current_vet_id() to authenticated;
grant execute on function app_private.require_aal2() to authenticated;
