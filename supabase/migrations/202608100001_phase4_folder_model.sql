-- Phase 4: the folder model (brief 10 August 2026 revision, §6.2).
--
-- A patient row becomes the head of a folder, and three columns decide how the
-- rest of the product behaves: kind, species, and purpose.
--
-- `purpose` and not `species` determines whether withdrawal periods apply. A pet
-- rabbit and a meat rabbit are the same species carrying entirely different
-- obligations, and only the veterinarian standing in front of the animal knows
-- which one it is. This migration records the fact; the obligation is enforced
-- where a drug is administered, in the treatments work that follows.
--
-- Additive by design. Every existing row stays valid, so the applications keep
-- working while the screens catch up.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.patients
  add column if not exists kind text not null default 'individual',
  add column if not exists purpose text not null default 'pet',
  add column if not exists ear_tag text,
  add column if not exists leg_ring text,
  add column if not exists head_count integer,
  add column if not exists group_age_weeks integer,
  add column if not exists housing text;

comment on column public.patients.kind is
  'individual: one animal. group: a flock, herd or pen managed as one patient.';
comment on column public.patients.purpose is
  'Whether the animal enters the food chain. Drives withdrawal obligations, independently of species.';
comment on column public.patients.head_count is
  'Group folders only. The denominator: "12 of 400 affected" is meaningless without it.';

-- ---------------------------------------------------------------------------
-- Normalise species before constraining it
-- ---------------------------------------------------------------------------

-- Species was free text. Fold the spellings a veterinarian actually types onto
-- the controlled list. Anything unrecognised becomes 'other' rather than being
-- guessed at, and the original wording is preserved in identification_notes so
-- no information typed by a person is destroyed by a schema change.
do $$
declare
  v_row record;
  v_normalised text;
  v_raw text;
begin
  for v_row in
    select id, species, identification_notes from public.patients
  loop
    v_raw := trim(coalesce(v_row.species, ''));
    v_normalised := case lower(v_raw)
      when 'dog' then 'dog'
      when 'canine' then 'dog'
      when 'puppy' then 'dog'
      when 'cat' then 'cat'
      when 'feline' then 'cat'
      when 'kitten' then 'cat'
      when 'bird' then 'bird'
      when 'parrot' then 'bird'
      when 'budgie' then 'bird'
      when 'budgerigar' then 'bird'
      when 'lovebird' then 'bird'
      when 'cattle' then 'cattle'
      when 'cow' then 'cattle'
      when 'bull' then 'cattle'
      when 'calf' then 'cattle'
      when 'heifer' then 'cattle'
      when 'sheep' then 'sheep'
      when 'ram' then 'sheep'
      when 'ewe' then 'sheep'
      when 'lamb' then 'sheep'
      when 'goat' then 'goat'
      when 'doe' then 'goat'
      when 'buck' then 'goat'
      when 'kid' then 'goat'
      when 'pig' then 'pig'
      when 'swine' then 'pig'
      when 'sow' then 'pig'
      when 'boar' then 'pig'
      when 'piglet' then 'pig'
      when 'poultry' then 'poultry'
      when 'chicken' then 'poultry'
      when 'fowl' then 'poultry'
      when 'layer' then 'poultry'
      when 'layers' then 'poultry'
      when 'broiler' then 'poultry'
      when 'broilers' then 'poultry'
      when 'cockerel' then 'poultry'
      when 'turkey' then 'poultry'
      when 'duck' then 'poultry'
      when 'guinea fowl' then 'poultry'
      when 'rabbit' then 'rabbit'
      when 'doe rabbit' then 'rabbit'
      else 'other'
    end;

    if v_normalised = 'other' and v_raw <> '' and lower(v_raw) <> 'other' then
      update public.patients
      set species = 'other',
          identification_notes = trim(both from
            coalesce(v_row.identification_notes || ' ', '')
            || '(species recorded as "' || v_raw || '" before the controlled list was introduced)'
          )
      where id = v_row.id;
    else
      update public.patients set species = v_normalised where id = v_row.id;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Constraints
-- ---------------------------------------------------------------------------

-- Sex is meaningful for one animal and not for a mixed flock, so the column
-- stops being universally required and becomes conditional below.
alter table public.patients alter column sex drop not null;

alter table public.patients
  drop constraint if exists patients_kind_check,
  drop constraint if exists patients_species_check,
  drop constraint if exists patients_purpose_check,
  drop constraint if exists patients_head_count_check,
  drop constraint if exists patients_group_age_weeks_check,
  drop constraint if exists patients_group_requires_head_count,
  drop constraint if exists patients_individual_requires_sex;

alter table public.patients
  add constraint patients_kind_check
    check (kind in ('individual', 'group')),
  add constraint patients_species_check
    check (species in (
      'dog', 'cat', 'bird',
      'cattle', 'sheep', 'goat', 'pig', 'poultry', 'rabbit',
      'other'
    )),
  add constraint patients_purpose_check
    check (purpose in ('pet', 'meat', 'milk', 'eggs', 'breeding', 'draught')),
  add constraint patients_head_count_check
    check (head_count is null or head_count > 0),
  add constraint patients_group_age_weeks_check
    check (group_age_weeks is null or group_age_weeks >= 0),
  -- A group must state how many. An individual must not carry a head count, or
  -- "3 of 1 affected" becomes expressible.
  add constraint patients_group_requires_head_count
    check (
      (kind = 'group' and head_count is not null)
      or (kind = 'individual' and head_count is null)
    ),
  add constraint patients_individual_requires_sex
    check (kind = 'group' or sex is not null);

create index if not exists patients_vet_kind_species_idx
  on public.patients (vet_id, kind, species)
  where deleted_at is null;

-- Microchip search (brief §6) already exists. Tags and rings are searched the
-- same way and were previously unrecordable.
create index if not exists patients_ear_tag_idx
  on public.patients (vet_id, ear_tag)
  where deleted_at is null and ear_tag is not null;

create index if not exists patients_leg_ring_idx
  on public.patients (vet_id, leg_ring)
  where deleted_at is null and leg_ring is not null;

-- ---------------------------------------------------------------------------
-- create_patient
-- ---------------------------------------------------------------------------

drop function if exists public.create_patient(uuid, text, text, text, text, text, date, text, text, text, text, uuid);

create or replace function public.create_patient(
  p_id uuid,
  p_patient_code text,
  p_name text,
  p_species text,
  p_kind text default 'individual',
  p_purpose text default 'pet',
  p_sex text default null,
  p_breed text default null,
  p_date_of_birth date default null,
  p_date_of_birth_precision text default 'exact',
  p_color_markings text default null,
  p_microchip_id text default null,
  p_ear_tag text default null,
  p_leg_ring text default null,
  p_identification_notes text default null,
  p_head_count integer default null,
  p_group_age_weeks integer default null,
  p_housing text default null,
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

  if char_length(trim(p_name)) not between 1 and 160 then
    raise exception 'Invalid patient name' using errcode = '22023';
  end if;

  if p_kind not in ('individual', 'group') then
    raise exception 'Invalid patient kind' using errcode = '22023';
  end if;

  if p_species not in (
    'dog', 'cat', 'bird', 'cattle', 'sheep', 'goat', 'pig', 'poultry', 'rabbit', 'other'
  ) then
    raise exception 'Invalid species' using errcode = '22023';
  end if;

  if p_purpose not in ('pet', 'meat', 'milk', 'eggs', 'breeding', 'draught') then
    raise exception 'Invalid purpose' using errcode = '22023';
  end if;

  -- Distinct messages. "A group needs a head count" and "an animal needs a sex"
  -- are different mistakes and a caller should be told which one it made.
  if p_kind = 'group' and (p_head_count is null or p_head_count <= 0) then
    raise exception 'A group needs a head count' using errcode = '22023';
  end if;

  if p_kind = 'individual' and p_head_count is not null then
    raise exception 'An individual animal cannot carry a head count' using errcode = '22023';
  end if;

  if p_kind = 'individual'
     and (p_sex is null or p_sex not in ('male', 'female', 'male_neutered', 'female_spayed', 'unknown'))
  then
    raise exception 'Invalid sex value' using errcode = '22023';
  end if;

  if p_kind = 'group' and p_sex is not null then
    raise exception 'A group does not carry a single sex' using errcode = '22023';
  end if;

  if upper(trim(p_patient_code)) !~ '^VK-P-[0-9A-HJKMNP-TV-Z]{6}$' then
    raise exception 'Invalid patient code format' using errcode = '22023';
  end if;

  insert into public.patients (
    id, vet_id, patient_code, name, kind, species, purpose, breed, sex,
    date_of_birth, date_of_birth_precision, color_markings,
    microchip_id, ear_tag, leg_ring, identification_notes,
    head_count, group_age_weeks, housing,
    created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, upper(trim(p_patient_code)), trim(p_name), p_kind, p_species, p_purpose,
    nullif(trim(p_breed), ''), p_sex,
    p_date_of_birth, coalesce(p_date_of_birth_precision, 'exact'),
    nullif(trim(p_color_markings), ''),
    nullif(trim(p_microchip_id), ''), nullif(trim(p_ear_tag), ''), nullif(trim(p_leg_ring), ''),
    nullif(trim(p_identification_notes), ''),
    p_head_count, p_group_age_weeks, nullif(trim(p_housing), ''),
    p_device_id, p_device_id
  )
  on conflict (id) do nothing;

  if not found then
    if exists (select 1 from public.patients where id = p_id and vet_id = v_vet_id) then
      return p_id;
    end if;
    raise exception 'Patient ID is unavailable' using errcode = '42501';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'patient.created', 'patient', p_id, null,
    jsonb_build_object(
      'patient_code', upper(trim(p_patient_code)),
      'species', p_species,
      'kind', p_kind,
      'purpose', p_purpose
    )
  );

  return p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_patient
-- ---------------------------------------------------------------------------

drop function if exists public.update_patient(uuid, text, text, text, text, date, text, text, text, text, text, date, uuid, bigint);

create or replace function public.update_patient(
  p_id uuid,
  p_name text,
  p_species text,
  p_kind text default 'individual',
  p_purpose text default 'pet',
  p_sex text default null,
  p_breed text default null,
  p_date_of_birth date default null,
  p_date_of_birth_precision text default 'exact',
  p_color_markings text default null,
  p_microchip_id text default null,
  p_ear_tag text default null,
  p_leg_ring text default null,
  p_identification_notes text default null,
  p_head_count integer default null,
  p_group_age_weeks integer default null,
  p_housing text default null,
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

  if p_kind not in ('individual', 'group') then
    raise exception 'Invalid patient kind' using errcode = '22023';
  end if;

  if p_species not in (
    'dog', 'cat', 'bird', 'cattle', 'sheep', 'goat', 'pig', 'poultry', 'rabbit', 'other'
  ) then
    raise exception 'Invalid species' using errcode = '22023';
  end if;

  if p_purpose not in ('pet', 'meat', 'milk', 'eggs', 'breeding', 'draught') then
    raise exception 'Invalid purpose' using errcode = '22023';
  end if;

  if p_kind = 'group' and (p_head_count is null or p_head_count <= 0) then
    raise exception 'A group needs a head count' using errcode = '22023';
  end if;

  if p_kind = 'individual' and p_head_count is not null then
    raise exception 'An individual animal cannot carry a head count' using errcode = '22023';
  end if;

  if p_kind = 'individual'
     and (p_sex is null or p_sex not in ('male', 'female', 'male_neutered', 'female_spayed', 'unknown'))
  then
    raise exception 'Invalid sex value' using errcode = '22023';
  end if;

  if p_kind = 'group' and p_sex is not null then
    raise exception 'A group does not carry a single sex' using errcode = '22023';
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

  -- Full replace, as before: a field the caller omits is cleared. Callers must
  -- send the whole record, not a patch.
  update public.patients
  set name = trim(p_name),
      kind = p_kind,
      species = p_species,
      purpose = p_purpose,
      sex = p_sex,
      breed = nullif(trim(p_breed), ''),
      date_of_birth = p_date_of_birth,
      date_of_birth_precision = coalesce(p_date_of_birth_precision, 'exact'),
      color_markings = nullif(trim(p_color_markings), ''),
      microchip_id = nullif(trim(p_microchip_id), ''),
      ear_tag = nullif(trim(p_ear_tag), ''),
      leg_ring = nullif(trim(p_leg_ring), ''),
      identification_notes = nullif(trim(p_identification_notes), ''),
      head_count = p_head_count,
      group_age_weeks = p_group_age_weeks,
      housing = nullif(trim(p_housing), ''),
      status = p_status,
      deceased_at = case when p_status = 'deceased' then p_deceased_at else null end,
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_id and vet_id = v_vet_id and deleted_at is null;

  perform app_private.insert_audit_event(v_vet_id, 'patient.updated', 'patient', p_id, null, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant execute on function public.create_patient(
  uuid, text, text, text, text, text, text, text, date, text, text, text, text, text, text,
  integer, integer, text, uuid
) to authenticated;

grant execute on function public.update_patient(
  uuid, text, text, text, text, text, text, date, text, text, text, text, text, text,
  integer, integer, text, text, date, uuid, bigint
) to authenticated;

revoke execute on function public.create_patient(
  uuid, text, text, text, text, text, text, text, date, text, text, text, text, text, text,
  integer, integer, text, uuid
) from public, anon;

revoke execute on function public.update_patient(
  uuid, text, text, text, text, text, text, date, text, text, text, text, text, text,
  integer, integer, text, text, date, uuid, bigint
) from public, anon;
