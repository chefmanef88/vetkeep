-- Video attachments.
--
-- A photograph cannot show a gait. Lameness, a seizure, a bloated rumen's
-- movement, a calf's breathing — these are the findings a veterinarian most
-- wants to send to a colleague for a second opinion, and the ones a still
-- picture is worst at. The attachment machinery already carries bytes to a
-- private bucket and back; what stopped video was three lists that did not
-- mention it.
--
-- The size limit moves with it. Twenty-five megabytes is a generous still and a
-- very short clip, and a clip too long to upload is worse than one that was
-- never offered: the vet has already pointed the phone at the animal. A hundred
-- megabytes is roughly a minute of phone video at the quality the client
-- compresses to, which is longer than any gait assessment needs.
--
-- That is a real cost on a Ghanaian mobile network, and the client is where it
-- is managed: the picker caps duration before a file is ever queued. This is
-- the ceiling, not the target.

-- The bucket's own allowlist. The client could not upload a video even with
-- every table below changed, because storage refuses the content type first.
update storage.buckets
set
  file_size_limit = 104857600,
  allowed_mime_types = array[
    'image/jpeg', 'image/png', 'image/heic', 'image/webp',
    -- What iOS and Android actually produce. iOS records QuickTime and Android
    -- MP4; both are offered rather than converting on the phone, which would
    -- cost more battery and time than the upload saves.
    'video/mp4', 'video/quicktime',
    'application/pdf'
  ]
where id = 'clinical-attachments';

-- 'video' joins the kinds an attachment can be. Named for what it is rather
-- than folded into 'other', because a list of attachments that calls a gait
-- recording "other" is a list nobody can scan.
alter table public.attachments
  drop constraint if exists attachments_attachment_type_check;

alter table public.attachments
  add constraint attachments_attachment_type_check
  check (attachment_type in ('photo', 'video', 'radiograph', 'lab_report', 'document', 'other'));

-- The same list again inside the function, which validates before inserting so
-- the error is a sentence rather than a constraint name. The signature is
-- unchanged on purpose: adding a parameter here would create an overload and
-- leave the old one callable.
create or replace function public.register_attachment(
  p_id uuid,
  p_original_filename text,
  p_mime_type text,
  p_size_bytes bigint,
  p_attachment_type text,
  p_patient_id uuid default null,
  p_visit_id uuid default null,
  p_captured_at timestamptz default null,
  p_device_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_path text;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  if p_patient_id is null and p_visit_id is null then
    raise exception 'An attachment must be filed against an animal or a visit' using errcode = '22023';
  end if;

  if p_attachment_type not in ('photo', 'video', 'radiograph', 'lab_report', 'document', 'other') then
    raise exception 'Invalid attachment type' using errcode = '22023';
  end if;

  if p_size_bytes is null or p_size_bytes <= 0 then
    raise exception 'Invalid file size' using errcode = '22023';
  end if;

  v_path := app_private.attachment_storage_path(v_vet_id, p_id, p_original_filename);

  insert into public.attachments (
    id, vet_id, patient_id, visit_id, storage_path, original_filename,
    mime_type, size_bytes, attachment_type, upload_status, captured_at,
    created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, p_patient_id, p_visit_id, v_path, trim(p_original_filename),
    trim(p_mime_type), p_size_bytes, p_attachment_type, 'pending', p_captured_at,
    p_device_id, p_device_id
  )
  on conflict (id) do nothing;

  if not found then
    -- A retried registration returns the same path, so the device resumes the
    -- upload it already started rather than creating a second copy.
    select storage_path into v_path
    from public.attachments
    where id = p_id and vet_id = v_vet_id;

    if v_path is null then
      raise exception 'Attachment ID is unavailable' using errcode = '42501';
    end if;
    return v_path;
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'attachment.registered', 'attachment', p_id, null,
    jsonb_build_object('attachment_type', p_attachment_type, 'size_bytes', p_size_bytes)
  );

  return v_path;
end;
$$;

-- A folder photograph has to stay a photograph, and nothing is added here to
-- make that true. set_patient_photo already refuses an attachment whose type is
-- not 'photo', so the moment 'video' became a valid type it was already covered
-- — and authenticated holds no write on patients, so that function is the only
-- way in. A trigger saying the same thing would be a second copy of one rule,
-- free to drift from the first.

comment on constraint attachments_attachment_type_check on public.attachments is
  'Includes video: a photograph cannot show a gait, and gait is what a second opinion is most often asked about.';
