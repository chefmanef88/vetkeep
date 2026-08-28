-- A place for what the structured fields cannot hold.
--
-- The record has somewhere for a complaint, a history, a diagnosis, a plan and
-- a follow-up, and every one of those means something specific. What it has
-- nowhere for is the sentence a clinician actually wants to leave: that the
-- owner is struggling to restrain the animal, that the yard has no crush, that
-- this is the third case in the same house this month, that the farmer was
-- advised to call earlier next time.
--
-- Those observations are why a vet reads back their own notes a year later, and
-- with no field for them they go into whichever box is nearest — usually the
-- treatment plan, which then stops meaning "the plan".
--
-- Not the same as follow_up_plan, which is an instruction with a date attached.
-- This is the clinician's own note, and it is bounded generously because it is
-- prose rather than a field.

alter table public.visits
  add column if not exists clinical_note text
    check (clinical_note is null or char_length(clinical_note) <= 4000);

comment on column public.visits.clinical_note is
  'The clinician''s own note on this consultation: context, judgement and '
  'anything the structured fields have nowhere for. Locked with the rest of '
  'the record when it is signed.';

-- Adding a parameter creates an overload rather than replacing the function, so
-- the twenty-four argument version is dropped explicitly. p_clinical_note goes
-- last: this project has already had a parameter inserted mid-signature, which
-- silently reinterpreted every positional argument after it.
drop function if exists public.update_visit_draft(
  uuid, timestamptz, text, text, text, text, text, numeric, integer, integer,
  numeric, text, text, text, text, text, text, text, text, text, text, date,
  uuid, bigint
);

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
  p_base_server_version bigint default null,
  p_clinical_note text default null
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

  if p_clinical_note is not null and char_length(p_clinical_note) > 4000 then
    raise exception 'Clinical note is too long' using errcode = '22023';
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
      clinical_note = nullif(trim(p_clinical_note), ''),
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_id and vet_id = v_vet_id and workflow_status = 'draft' and deleted_at is null;

  perform app_private.insert_audit_event(v_vet_id, 'visit.draft_updated', 'visit', p_id, null, '{}'::jsonb);
end;
$$;
