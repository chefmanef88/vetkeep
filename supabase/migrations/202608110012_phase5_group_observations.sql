-- What a herd record is actually about.
--
-- A consultation on a flock was recorded with the same fields as one on a dog:
-- a temperature, a heart rate, a body condition score. Those are not wrong on a
-- farm visit — a vet examines representative animals and those figures are
-- real — but on their own they describe one animal out of four hundred and say
-- nothing about the outbreak.
--
-- What the record was missing is the population: how many are affected, how
-- many are dead, out of how many, and in which house. That is what the farmer
-- is asking about, what the next visit is compared against, and what a
-- notifiable disease report is built from.
--
-- The individual vitals stay. They are now a sample rather than the subject:
-- the application labels them as such for a group, and the two together say
-- "eleven of four hundred are sick, and here is what one of them looks like",
-- which is the shape of the actual clinical picture.
--
-- Morbidity and mortality are deliberately not stored. They are affected over
-- size and dead over size, and a stored percentage drifts from its own
-- numerator the first time either is corrected.

alter table public.visits
  add column if not exists group_size_at_visit integer
    check (group_size_at_visit is null or group_size_at_visit > 0),
  -- Recorded per visit rather than read from patients.head_count: a flock is
  -- not the same size in March as it was in January, and a rate calculated
  -- against today's headcount would silently rewrite last year's outbreak.
  add column if not exists animals_affected integer
    check (animals_affected is null or animals_affected >= 0),
  add column if not exists animals_dead integer
    check (animals_dead is null or animals_dead >= 0),
  add column if not exists housing_unit text
    check (housing_unit is null or char_length(housing_unit) <= 120);

-- Neither count can exceed the group. They are not constrained against each
-- other: a peracute death may never have been entered as affected first, and
-- refusing that would make the vet fabricate a number to get past the form.
alter table public.visits
  drop constraint if exists visits_group_counts_within_size_check;

alter table public.visits
  add constraint visits_group_counts_within_size_check check (
    group_size_at_visit is null
    or (
      coalesce(animals_affected, 0) <= group_size_at_visit
      and coalesce(animals_dead, 0) <= group_size_at_visit
    )
  );

comment on column public.visits.group_size_at_visit is
  'The size of the group on the day, the denominator for morbidity and '
  'mortality. Held per visit because a flock changes size between visits.';
comment on column public.visits.animals_affected is
  'How many showed signs. Null means not counted, which is not the same as zero.';
comment on column public.visits.animals_dead is
  'How many were found dead. Null means not counted, which is not the same as zero.';
comment on column public.visits.housing_unit is
  'Which house, pen or paddock. An outbreak is usually confined to one.';

drop function if exists public.update_visit_draft(
  uuid, timestamptz, text, text, text, text, text, numeric, integer, integer,
  numeric, text, text, text, text, text, text, text, text, text, text, date,
  uuid, bigint, text
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
  p_clinical_note text default null,
  p_group_size_at_visit integer default null,
  p_animals_affected integer default null,
  p_animals_dead integer default null,
  p_housing_unit text default null
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
  v_kind text;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  select v.server_version, v.workflow_status, p.kind
    into v_current, v_status, v_kind
  from public.visits v
  join public.patients p on p.id = v.patient_id
  where v.id = p_id and v.vet_id = v_vet_id and v.deleted_at is null;

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

  -- Population figures belong to a group. Refused rather than ignored on an
  -- individual: silently dropping them would leave the vet believing a number
  -- was recorded, and "3 of 1" is not a thing a folder should be able to say.
  if v_kind <> 'group' and (
    p_group_size_at_visit is not null
    or p_animals_affected is not null
    or p_animals_dead is not null
    or p_housing_unit is not null
  ) then
    raise exception 'Group figures belong to a group folder' using errcode = '22023';
  end if;

  if p_group_size_at_visit is not null and p_group_size_at_visit <= 0 then
    raise exception 'Group size must be more than zero' using errcode = '22023';
  end if;

  if p_group_size_at_visit is not null and coalesce(p_animals_affected, 0) > p_group_size_at_visit then
    raise exception 'More affected than there are animals' using errcode = '22023';
  end if;

  if p_group_size_at_visit is not null and coalesce(p_animals_dead, 0) > p_group_size_at_visit then
    raise exception 'More dead than there are animals' using errcode = '22023';
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
      group_size_at_visit = p_group_size_at_visit,
      animals_affected = p_animals_affected,
      animals_dead = p_animals_dead,
      housing_unit = nullif(trim(p_housing_unit), ''),
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_id and vet_id = v_vet_id and workflow_status = 'draft' and deleted_at is null;

  perform app_private.insert_audit_event(v_vet_id, 'visit.draft_updated', 'visit', p_id, null, '{}'::jsonb);
end;
$$;
