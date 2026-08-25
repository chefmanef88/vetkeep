-- Phase 4: ectoparasite control, and a species field that stops fighting the vet.
--
-- Two things, both reported from real use.
--
-- 1. Preventive care recorded vaccination and deworming. Tick, flea and mite
--    control is the third leg of the same job — it is given on a schedule, it
--    has a next-due date, and an owner asks about it in the same breath as
--    worming. It had nowhere to go.
--
-- 2. `species` rejected 'canine' and rejected 'Dog'. The second is the worse
--    bug: the web form's own placeholder said "Dog", so the interface was
--    telling a veterinarian to type a value the database would refuse. Nothing
--    about a capital letter should be a validation error.

-- ---------------------------------------------------------------------------
-- Ectoparasite control
-- ---------------------------------------------------------------------------

alter table public.preventive_care
  drop constraint if exists preventive_care_kind_check;

alter table public.preventive_care
  add constraint preventive_care_kind_check
  check (kind in ('vaccination', 'deworming', 'ectoparasite_control'));

-- Which parasite was being treated. A vet writes "ticks and fleas", and that
-- detail is what makes the history useful six months later when the owner asks
-- why the dog is scratching again.
alter table public.preventive_care
  add column if not exists target_parasites text[];

alter table public.preventive_care
  drop constraint if exists preventive_care_target_parasites_check,
  drop constraint if exists preventive_care_target_parasites_kind_check;

alter table public.preventive_care
  add constraint preventive_care_target_parasites_check
    check (
      target_parasites is null
      or target_parasites <@ array['ticks', 'fleas', 'mites', 'lice', 'flies', 'other']::text[]
    ),
  -- A vaccination does not target a parasite. Keeping the column meaningful is
  -- cheaper than explaining later why a rabies shot lists ticks.
  add constraint preventive_care_target_parasites_kind_check
    check (kind = 'ectoparasite_control' or target_parasites is null);

comment on column public.preventive_care.target_parasites is
  'For ectoparasite control: what was being treated. Ticks, fleas and mites are '
  'the common three; lice and flies matter on livestock.';

-- ---------------------------------------------------------------------------
-- Species that accepts what a veterinarian types
-- ---------------------------------------------------------------------------

-- Case and clinical synonyms are resolved here, once, rather than in each
-- caller. The mapping is deliberately narrow: only pairs that mean exactly one
-- thing.
--
-- 'avian' is absent on purpose. This product distinguishes a pet bird from
-- poultry — different examination sets, different withdrawal obligations — and
-- 'avian' does not say which. Guessing there would put a budgerigar on a food
-- animal pathway, or a broiler flock on a pet one.
create or replace function app_private.normalize_species(p_species text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case lower(trim(coalesce(p_species, '')))
    when 'canine' then 'dog'
    when 'feline' then 'cat'
    when 'bovine' then 'cattle'
    when 'cow' then 'cattle'
    when 'ovine' then 'sheep'
    when 'caprine' then 'goat'
    when 'porcine' then 'pig'
    when 'swine' then 'pig'
    when 'lapine' then 'rabbit'
    when 'chicken' then 'poultry'
    when 'fowl' then 'poultry'
    else lower(trim(coalesce(p_species, '')))
  end
$$;

revoke all on function app_private.normalize_species(text) from public, anon;
grant execute on function app_private.normalize_species(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Recording preventive care
-- ---------------------------------------------------------------------------

-- p_target_parasites overloads rather than replaces, and two
-- record_preventive_care functions would let PostgREST resolve a named call to
-- either. The old signature goes first.
drop function if exists public.record_preventive_care(
  uuid, uuid, text, text, date, text, text, text, text, text, integer, date, uuid, text, uuid
);

create or replace function public.record_preventive_care(
  p_id uuid,
  p_patient_id uuid,
  p_kind text,
  p_product_name text,
  p_date_given date,
  p_vaccine_type text default null,
  p_manufacturer text default null,
  p_batch_lot_number text default null,
  p_dose text default null,
  p_route text default null,
  p_animals_treated integer default null,
  p_next_due_date date default null,
  p_visit_id uuid default null,
  p_notes text default null,
  p_device_id uuid default null,
  p_target_parasites text[] default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_vet_id uuid;
  v_owns_patient boolean;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  if p_kind not in ('vaccination', 'deworming', 'ectoparasite_control') then
    raise exception 'Invalid preventive care kind' using errcode = '22023';
  end if;

  if char_length(trim(coalesce(p_product_name, ''))) not between 1 and 160 then
    raise exception 'Name the product that was given' using errcode = '22023';
  end if;

  if p_date_given is null then
    raise exception 'A date given is required' using errcode = '22023';
  end if;

  -- Distinct from a general date check: recording a future vaccination as
  -- already given would make an animal look protected when it is not.
  if p_date_given > (now() at time zone 'UTC')::date then
    raise exception 'A date given cannot be in the future' using errcode = '22023';
  end if;

  if p_kind = 'vaccination' and p_vaccine_type is null then
    raise exception 'Choose which vaccine was given' using errcode = '22023';
  end if;

  if p_kind = 'deworming' and p_vaccine_type is not null then
    raise exception 'A dewormer does not carry a vaccine type' using errcode = '22023';
  end if;

  if p_kind = 'ectoparasite_control' and p_vaccine_type is not null then
    raise exception 'Parasite control does not carry a vaccine type' using errcode = '22023';
  end if;

  -- The column only means something for parasite control. A rabies shot listing
  -- ticks would be worse than no column at all.
  if p_kind <> 'ectoparasite_control' and p_target_parasites is not null then
    raise exception 'Only ectoparasite control targets a parasite' using errcode = '22023';
  end if;

  if p_target_parasites is not null
     and not (p_target_parasites <@ array['ticks', 'fleas', 'mites', 'lice', 'flies', 'other']::text[]) then
    raise exception 'Invalid parasite' using errcode = '22023';
  end if;

  if p_next_due_date is not null and p_next_due_date < p_date_given then
    raise exception 'The next dose cannot be due before the one just given' using errcode = '22023';
  end if;

  select true into v_owns_patient
  from public.patients
  where id = p_patient_id and vet_id = v_vet_id and deleted_at is null;

  if v_owns_patient is null then
    raise exception 'Folder not found' using errcode = 'P0002';
  end if;

  insert into public.preventive_care (
    id, vet_id, patient_id, visit_id, kind, vaccine_type,
    product_name, manufacturer, batch_lot_number, dose, route, animals_treated,
    date_given, next_due_date, notes, target_parasites,
    created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, p_patient_id, p_visit_id, p_kind, p_vaccine_type,
    trim(p_product_name), nullif(trim(p_manufacturer), ''),
    nullif(trim(p_batch_lot_number), ''), nullif(trim(p_dose), ''), p_route, p_animals_treated,
    p_date_given, p_next_due_date, nullif(trim(p_notes), ''), p_target_parasites,
    p_device_id, p_device_id
  )
  on conflict (id) do nothing;

  -- Idempotent under a retried sync, like every other create in this schema.
  if not found then
    if exists (select 1 from public.preventive_care where id = p_id and vet_id = v_vet_id) then
      return p_id;
    end if;
    raise exception 'Preventive care ID is unavailable' using errcode = '42501';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id,
    case p_kind
      when 'vaccination' then 'vaccination.recorded'
      when 'deworming' then 'deworming.recorded'
      else 'ectoparasite_control.recorded'
    end,
    'preventive_care', p_id, null,
    jsonb_build_object(
      'patient_id', p_patient_id,
      'kind', p_kind,
      'vaccine_type', p_vaccine_type,
      'date_given', p_date_given,
      'next_due_date', p_next_due_date,
      'target_parasites', p_target_parasites
    )
  );

  return p_id;
end;
$fn$;

revoke all on function public.record_preventive_care(
  uuid, uuid, text, text, date, text, text, text, text, text, integer, date, uuid, text, uuid, text[]
) from public, anon;
grant execute on function public.record_preventive_care(
  uuid, uuid, text, text, date, text, text, text, text, text, integer, date, uuid, text, uuid, text[]
) to authenticated;

-- ---------------------------------------------------------------------------
-- The passport carries the whole preventive picture
-- ---------------------------------------------------------------------------

-- A boarding kennel cares about worming and tick control exactly as much as it
-- cares about vaccination. Same allow-list discipline: named fields only.
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

  if v_passport.id is null then
    return null;
  end if;

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
      where pc.patient_id = p.id and pc.kind = 'vaccination' and pc.deleted_at is null
    ), '[]'::jsonb),
    'dewormings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_name', pc.product_name,
        'date_given', pc.date_given,
        'next_due_date', pc.next_due_date
      ) order by pc.date_given desc)
      from public.preventive_care pc
      where pc.patient_id = p.id and pc.kind = 'deworming' and pc.deleted_at is null
    ), '[]'::jsonb),
    'parasite_control', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_name', pc.product_name,
        'target_parasites', pc.target_parasites,
        'date_given', pc.date_given,
        'next_due_date', pc.next_due_date
      ) order by pc.date_given desc)
      from public.preventive_care pc
      where pc.patient_id = p.id and pc.kind = 'ectoparasite_control' and pc.deleted_at is null
    ), '[]'::jsonb),
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
  where p.id = v_passport.patient_id and p.deleted_at is null;

  if v_result is null then
    return null;
  end if;

  insert into public.passport_access_events (passport_id) values (v_passport.id);

  return v_result;
end;
$$;

revoke all on function public.passport_by_token(text) from public;
grant execute on function public.passport_by_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_patient normalises before it validates
-- ---------------------------------------------------------------------------
--
-- Reproduced from the live definition with exactly one line added, rather than
-- retyped. Rewriting a large function by hand is how an error contract gets
-- quietly changed, and this one has nineteen parameters.

CREATE OR REPLACE FUNCTION public.create_patient(p_id uuid, p_patient_code text, p_name text, p_species text, p_kind text DEFAULT 'individual'::text, p_purpose text DEFAULT 'pet'::text, p_sex text DEFAULT NULL::text, p_breed text DEFAULT NULL::text, p_date_of_birth date DEFAULT NULL::date, p_date_of_birth_precision text DEFAULT 'exact'::text, p_color_markings text DEFAULT NULL::text, p_microchip_id text DEFAULT NULL::text, p_ear_tag text DEFAULT NULL::text, p_leg_ring text DEFAULT NULL::text, p_identification_notes text DEFAULT NULL::text, p_head_count integer DEFAULT NULL::integer, p_group_age_weeks integer DEFAULT NULL::integer, p_housing text DEFAULT NULL::text, p_device_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_vet_id uuid;
begin
  perform app_private.require_aal2();

  -- Accept what a veterinarian types: canine, Dog, COW. Normalised once here so
  -- the check below, the row written and the audit entry can never differ.
  p_species := app_private.normalize_species(p_species);
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
$function$;
