-- The folder ends at death.
--
-- record_euthanasia marks the patient deceased, but create_visit never looked,
-- so a new consultation could be started on an animal whose death this same
-- application had just recorded. The brief says the folder ends there; it did
-- not.
--
-- Reproduced from the deployed definition with one column added to the select
-- and one guard added after the existing not-found check. Everything else is
-- as it was.

CREATE OR REPLACE FUNCTION public.create_visit(p_id uuid, p_patient_id uuid, p_visit_date timestamp with time zone, p_visit_type text, p_chief_complaint text DEFAULT NULL::text, p_device_id uuid DEFAULT NULL::uuid, p_record_code text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_vet_id uuid;
  v_species text;
  v_kind text;
  v_code text;
  v_status text;
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

  select species, kind, status into v_species, v_kind, v_status
  from public.patients
  where id = p_patient_id and vet_id = v_vet_id and deleted_at is null;

  if v_species is null then
    raise exception 'Patient not found' using errcode = 'P0002';
  end if;

  -- The folder ends at death. Recording a euthanasia marks the animal
  -- deceased, and until this guard existed the folder carried on exactly as
  -- before: a new consultation could be started on an animal the same
  -- application had just recorded the death of. Reported from the phone.
  --
  -- Refused rather than warned. A consultation on a dead animal is either a
  -- mistake or belongs to the visit where the death was recorded, and a
  -- necropsy — the one honest exception — is a different kind of record that
  -- this application does not yet have.
  if v_status = 'deceased' then
    raise exception 'This animal is recorded as deceased' using errcode = '42501';
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
$function$;
