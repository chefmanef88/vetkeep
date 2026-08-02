-- VetKeep Phase 3: optimistic concurrency for offline sync.
--
-- Brief 15.5 requires the server to validate the base_server_version a device
-- was editing, and 15.6 requires a stale write to surface as a typed conflict
-- rather than being applied. Without this the last device to reconnect silently
-- overwrites the other, which for a clinical note means a vet's observation
-- disappears with nothing to show it ever existed.
--
-- The check is opt-in: passing null keeps the existing overwrite behaviour, so
-- the web app, which edits one record in one tab against a live connection, is
-- unaffected. The mobile client passes the version it read and gets a conflict
-- it can hand to the vet.

-- 40001 is serialization_failure. It is distinct from the 42501/22023/P0002 set
-- already in use, so a client can map it to "stale" without parsing messages.
create or replace function app_private.assert_fresh(
  p_expected bigint,
  p_actual bigint,
  p_entity text
)
returns void
language plpgsql
immutable
as $$
begin
  if p_expected is null then
    return;
  end if;

  if p_expected <> p_actual then
    raise exception
      'This % changed on another device (expected version %, server has %)',
      p_entity, p_expected, p_actual
      using errcode = '40001';
  end if;
end;
$$;

revoke all on function app_private.assert_fresh(bigint, bigint, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------------

drop function if exists public.update_client(uuid, text, text, text, text, text, text, text, numeric, numeric, boolean, text, uuid);

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
  p_device_id uuid default null,
  p_base_server_version bigint default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_current bigint;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  if char_length(trim(p_name)) not between 1 and 160 then
    raise exception 'Invalid client name' using errcode = '22023';
  end if;

  if p_phone_e164 !~ '^[+][1-9][0-9]{7,14}$' then
    raise exception 'Invalid E.164 phone number' using errcode = '22023';
  end if;

  select server_version into v_current
  from public.clients
  where id = p_id and vet_id = v_vet_id and deleted_at is null;

  if v_current is null then
    raise exception 'Client not found' using errcode = 'P0002';
  end if;

  perform app_private.assert_fresh(p_base_server_version, v_current, 'client');

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

  perform app_private.insert_audit_event(v_vet_id, 'client.updated', 'client', p_id, null, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Patients
-- ---------------------------------------------------------------------------

drop function if exists public.update_patient(uuid, text, text, text, text, date, text, text, text, text, text, date, uuid);

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
  p_device_id uuid default null,
  p_base_server_version bigint default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_current bigint;
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

  select server_version into v_current
  from public.patients
  where id = p_id and vet_id = v_vet_id and deleted_at is null;

  if v_current is null then
    raise exception 'Patient not found' using errcode = 'P0002';
  end if;

  perform app_private.assert_fresh(p_base_server_version, v_current, 'animal');

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

  perform app_private.insert_audit_event(v_vet_id, 'patient.updated', 'patient', p_id, null, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Visit drafts
-- ---------------------------------------------------------------------------

drop function if exists public.update_visit_draft(uuid, timestamptz, text, text, text, text, text, numeric, integer, integer, numeric, text, text, text, text, text, text, text, text, text, text, date, uuid);

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
  p_device_id uuid default null,
  p_base_server_version bigint default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_current bigint;
  v_status text;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  select server_version, workflow_status into v_current, v_status
  from public.visits
  where id = p_id and vet_id = v_vet_id and deleted_at is null;

  if v_current is null then
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

  -- Two devices writing different assessments of the same animal is a clinical
  -- disagreement. The vet resolves it; the server refuses to pick a winner.
  perform app_private.assert_fresh(p_base_server_version, v_current, 'consultation');

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

  perform app_private.insert_audit_event(v_vet_id, 'visit.draft_updated', 'visit', p_id, null, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Examination findings
-- ---------------------------------------------------------------------------

drop function if exists public.set_exam_finding(uuid, text, text, text, uuid);

-- Identical to the Phase 2 function apart from the version check. The error
-- ordering matters and is preserved exactly: a signed visit and a visit
-- belonging to another vet are different problems, and collapsing them would
-- both mislead the vet and leak whether another account's record exists.
create or replace function public.set_exam_finding(
  p_visit_id uuid,
  p_system_name text,
  p_status text,
  p_remarks text default null,
  p_device_id uuid default null,
  p_base_server_version bigint default null
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
  v_current bigint;
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

  select id, server_version into v_finding_id, v_current
  from public.physical_exam_findings
  where visit_id = p_visit_id
    and vet_id = v_vet_id
    and system_name = p_system_name
    and deleted_at is null;

  if v_finding_id is null then
    raise exception 'Examination system not found for this visit' using errcode = 'P0002';
  end if;

  -- Scoped per system, so a conflict names the one system that differs rather
  -- than putting the whole examination in question.
  perform app_private.assert_fresh(p_base_server_version, v_current, 'examination finding');

  update public.physical_exam_findings
  set status = p_status,
      remarks = nullif(trim(p_remarks), ''),
      examined_at = case when p_status = 'not_examined' then null else now() end,
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = v_finding_id;

  perform app_private.insert_audit_event(
    v_vet_id, 'visit.exam_finding_recorded', 'physical_exam_finding', v_finding_id, null,
    jsonb_build_object('visit_id', p_visit_id, 'system_name', p_system_name, 'status', p_status)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Dropping a function drops its grants, so every one is restated.
-- ---------------------------------------------------------------------------

grant execute on function public.update_client(uuid, text, text, text, text, text, text, text, numeric, numeric, boolean, text, uuid, bigint) to authenticated;
grant execute on function public.update_patient(uuid, text, text, text, text, date, text, text, text, text, text, date, uuid, bigint) to authenticated;
grant execute on function public.update_visit_draft(uuid, timestamptz, text, text, text, text, text, numeric, integer, integer, numeric, text, text, text, text, text, text, text, text, text, text, date, uuid, bigint) to authenticated;
grant execute on function public.set_exam_finding(uuid, text, text, text, uuid, bigint) to authenticated;

revoke execute on function public.update_client(uuid, text, text, text, text, text, text, text, numeric, numeric, boolean, text, uuid, bigint) from public, anon;
revoke execute on function public.update_patient(uuid, text, text, text, text, date, text, text, text, text, text, date, uuid, bigint) from public, anon;
revoke execute on function public.update_visit_draft(uuid, timestamptz, text, text, text, text, text, numeric, integer, integer, numeric, text, text, text, text, text, text, text, text, text, text, date, uuid, bigint) from public, anon;
revoke execute on function public.set_exam_finding(uuid, text, text, text, uuid, bigint) from public, anon;
