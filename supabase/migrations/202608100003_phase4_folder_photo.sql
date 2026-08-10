-- Phase 4: a photograph on the folder.
--
-- The brief sketched profile_photo_attachment_id in §6.2 but the Phase 2
-- migration never created it, so the column is added here. A picture is the
-- fastest identification there is: an owner recognises their animal in a shared
-- document before reading a word, and a referral vet settles which goat is which
-- faster than a tag number allows.
--
-- The reference may be set before the file has finished uploading. A vet
-- photographing a calf in a field with no signal has a queued attachment and no
-- bytes on the server for hours; refusing the reference until then would mean
-- the folder they are looking at does not show the picture they just took.
-- Readers fall back to initials while the object is missing.

alter table public.patients
  add column if not exists profile_photo_attachment_id uuid;

do $$
begin
  -- Attachments already reference patients, so this closes a cycle. Both sides
  -- are nullable and this one clears rather than cascades, so deleting a
  -- photograph can never take the animal's folder with it.
  if not exists (
    select 1 from pg_constraint where conname = 'patients_profile_photo_fkey'
  ) then
    alter table public.patients
      add constraint patients_profile_photo_fkey
      foreign key (profile_photo_attachment_id)
      references public.attachments(id) on delete set null;
  end if;
end;
$$;

comment on column public.patients.profile_photo_attachment_id is
  'The folder picture. May point at an attachment whose bytes have not uploaded yet.';

-- p_attachment_id defaults to null so omitting it clears the picture, which is
-- how a photograph of the wrong animal is corrected without deleting the file.
create or replace function public.set_patient_photo(
  p_patient_id uuid,
  p_attachment_id uuid default null,
  p_device_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_owns_patient boolean;
  v_attachment_patient uuid;
  v_attachment_type text;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  select true into v_owns_patient
  from public.patients
  where id = p_patient_id and vet_id = v_vet_id and deleted_at is null;

  if v_owns_patient is null then
    raise exception 'Folder not found' using errcode = 'P0002';
  end if;

  -- Null clears the photograph, which is how a picture of the wrong animal is
  -- corrected without deleting the attachment itself.
  if p_attachment_id is not null then
    select patient_id, attachment_type
    into v_attachment_patient, v_attachment_type
    from public.attachments
    where id = p_attachment_id and vet_id = v_vet_id and deleted_at is null;

    if v_attachment_type is null then
      raise exception 'Attachment not found' using errcode = 'P0002';
    end if;

    if v_attachment_type <> 'photo' then
      raise exception 'Only a photograph can be a folder picture' using errcode = '22023';
    end if;

    -- Named separately from "not found": a radiograph of another animal is a
    -- different mistake from a missing file, and the distinction matters when
    -- the picture identifies the patient.
    if v_attachment_patient is distinct from p_patient_id then
      raise exception 'That photograph belongs to a different folder' using errcode = '22023';
    end if;
  end if;

  update public.patients
  set profile_photo_attachment_id = p_attachment_id,
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_patient_id and vet_id = v_vet_id and deleted_at is null;

  perform app_private.insert_audit_event(
    v_vet_id,
    case when p_attachment_id is null then 'patient.photo_cleared' else 'patient.photo_set' end,
    'patient',
    p_patient_id,
    null,
    jsonb_build_object('attachment_id', p_attachment_id)
  );
end;
$$;

grant execute on function public.set_patient_photo(uuid, uuid, uuid) to authenticated;
revoke execute on function public.set_patient_photo(uuid, uuid, uuid) from public, anon;
