-- Phase 4: examine the animal in front of you (brief §7.9).
--
-- Every consultation seeded the same eleven mammalian systems. A budgerigar was
-- offered Lymphatic and Urogenital and nowhere to record a crop, a keel or a
-- vent; a rabbit had nowhere to record its teeth, which is among the commonest
-- reasons one is presented at all. A checklist that asks the wrong questions is
-- worse than a short one: it invites a vet to mark "normal" against something
-- they did not look at because it does not exist on this animal.
--
-- The mammalian eleven stay as they are for the animals they were written for.
-- Birds get an avian set, rabbits gain Dental, and a group gets nothing at all —
-- a flock is assessed by counts and post-mortem, not by palpating four hundred
-- birds one at a time (§7.9).

-- ---------------------------------------------------------------------------
-- Which systems exist
-- ---------------------------------------------------------------------------

alter table public.physical_exam_findings
  drop constraint if exists physical_exam_findings_system_name_check;

alter table public.physical_exam_findings
  add constraint physical_exam_findings_system_name_check
  check (system_name in (
    -- Mammalian
    'General', 'Cardiovascular', 'Respiratory', 'Gastrointestinal', 'Musculoskeletal',
    'Integumentary', 'Neurological', 'Ocular', 'Aural', 'Urogenital', 'Lymphatic',
    -- Rabbits, and any species where dentition is a presenting problem
    'Dental',
    -- Avian
    'Beak and cere', 'Crop', 'Plumage', 'Keel', 'Vent', 'Wings'
  ));

-- ---------------------------------------------------------------------------
-- Which systems this animal has
-- ---------------------------------------------------------------------------

-- The original, kept so nothing that calls it without a species breaks.
create or replace function app_private.exam_system_names()
returns text[]
language sql
immutable
set search_path = pg_catalog
as $$
  select array[
    'General', 'Cardiovascular', 'Respiratory', 'Gastrointestinal', 'Musculoskeletal',
    'Integumentary', 'Neurological', 'Ocular', 'Aural', 'Urogenital', 'Lymphatic'
  ]::text[]
$$;

create or replace function app_private.exam_system_names(
  p_species text,
  p_kind text default 'individual'
)
returns text[]
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    -- A flock is not examined system by system. Its objective findings are head
    -- count, number affected, mortality and post-mortem, which live on the
    -- record itself rather than in a checklist.
    when p_kind = 'group' then array[]::text[]

    when p_species = 'bird' then array[
      'General', 'Beak and cere', 'Ocular', 'Crop', 'Respiratory',
      'Plumage', 'Keel', 'Wings', 'Vent', 'Musculoskeletal', 'Neurological'
    ]::text[]

    -- Incisor and molar overgrowth is among the commonest reasons a rabbit is
    -- presented, and the mammalian eleven have nowhere to put it.
    when p_species = 'rabbit' then array[
      'General', 'Ocular', 'Aural', 'Dental', 'Cardiovascular', 'Respiratory',
      'Gastrointestinal', 'Urogenital', 'Musculoskeletal', 'Neurological',
      'Integumentary', 'Lymphatic'
    ]::text[]

    else array[
      'General', 'Cardiovascular', 'Respiratory', 'Gastrointestinal', 'Musculoskeletal',
      'Integumentary', 'Neurological', 'Ocular', 'Aural', 'Urogenital', 'Lymphatic'
    ]::text[]
  end
$$;

-- ---------------------------------------------------------------------------
-- Seeding a record with the right set
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
  v_species text;
  v_kind text;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  if p_visit_type is null or p_visit_type not in (
    'home_call', 'clinic_visit', 'field_visit', 'emergency', 'follow_up', 'teleconsult'
  ) then
    raise exception 'Invalid visit type' using errcode = '22023';
  end if;

  select species, kind into v_species, v_kind
  from public.patients
  where id = p_patient_id and vet_id = v_vet_id and deleted_at is null;

  if v_species is null then
    raise exception 'Patient not found' using errcode = 'P0002';
  end if;

  insert into public.visits (
    id, vet_id, patient_id, visit_date, visit_type, chief_complaint,
    created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, p_patient_id, p_visit_date, p_visit_type,
    nullif(trim(p_chief_complaint), ''), p_device_id, p_device_id
  )
  on conflict (id) do nothing;

  if not found then
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
    jsonb_build_object('patient_id', p_patient_id, 'visit_type', p_visit_type)
  );

  return p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Recording against the right set
-- ---------------------------------------------------------------------------

-- set_exam_finding validated against the mammalian eleven, which would refuse a
-- crop on a bird. It now validates against the set the animal actually has.
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
  v_workflow text;
  v_species text;
  v_kind text;
  v_current bigint;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  if p_status is null or p_status not in (
    'not_examined', 'normal', 'abnormal', 'not_applicable'
  ) then
    raise exception 'Invalid examination status' using errcode = '22023';
  end if;

  select v.workflow_status, p.species, p.kind
  into v_workflow, v_species, v_kind
  from public.visits v
  join public.patients p on p.id = v.patient_id
  where v.id = p_visit_id and v.vet_id = v_vet_id and v.deleted_at is null;

  -- Kept distinct from "this visit is signed": a record belonging to someone
  -- else and one that is closed are different problems.
  if v_workflow is null then
    raise exception 'Visit not found' using errcode = 'P0002';
  end if;

  -- Code and wording preserved from the original. Callers and the test suite
  -- read these, so a rewrite that "improves" the message silently breaks the
  -- contract; this one already did once.
  if v_workflow <> 'draft' then
    raise exception 'Examination findings can only change while the visit is a draft'
      using errcode = '42501';
  end if;

  if p_system_name is null
     or not (p_system_name = any (app_private.exam_system_names(v_species, v_kind))) then
    raise exception 'Invalid examination system' using errcode = '22023';
  end if;

  select server_version into v_current
  from public.physical_exam_findings
  where visit_id = p_visit_id and system_name = p_system_name and deleted_at is null;

  if v_current is null then
    raise exception 'Examination system not found on this visit' using errcode = 'P0002';
  end if;

  perform app_private.assert_fresh(p_base_server_version, v_current, 'examination finding');

  update public.physical_exam_findings
  set status = p_status,
      remarks = nullif(trim(p_remarks), ''),
      examined_at = case when p_status = 'not_examined' then null else now() end,
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where visit_id = p_visit_id and system_name = p_system_name and deleted_at is null;

  perform app_private.insert_audit_event(
    v_vet_id, 'exam_finding.set', 'visit', p_visit_id, null,
    jsonb_build_object('visit_id', p_visit_id, 'system_name', p_system_name, 'status', p_status)
  );
end;
$$;
