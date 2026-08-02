-- VetKeep Phase 3: clinical attachments and their private storage.
--
-- Brief 7.6: medical files live in private storage, no public URL is ever
-- persisted, every storage path begins with the owning vet_id, and access is
-- granted through short-lived signed URLs after authorisation.
--
-- The mobile client keeps the local copy of a photo until the server confirms
-- the checksum and marks the upload complete. That ordering is the whole point:
-- a radiograph taken in a yard exists in exactly one place until the server says
-- otherwise, so the device must not be the first to let go.
--
-- diagnostic_id from the brief's 7.6 DDL is deliberately absent. The diagnostics
-- table in 7.5 is not built yet, and a foreign key to a table that does not
-- exist is not a placeholder, it is a broken migration. It arrives with 7.5.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clinical-attachments',
  'clinical-attachments',
  false,
  26214400,
  array[
    'image/jpeg', 'image/png', 'image/heic', 'image/webp',
    'application/pdf'
  ]
)
on conflict (id) do nothing;

create table public.attachments (
  id uuid primary key,
  vet_id uuid not null references public.vets(id) on delete restrict,
  patient_id uuid references public.patients(id) on delete restrict,
  visit_id uuid references public.visits(id) on delete restrict,
  storage_bucket text not null default 'clinical-attachments',
  storage_path text not null,
  original_filename text not null check (char_length(trim(original_filename)) between 1 and 260),
  mime_type text not null check (char_length(mime_type) between 3 and 120),
  size_bytes bigint not null check (size_bytes > 0),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'),
  attachment_type text not null
    check (attachment_type in ('photo', 'radiograph', 'lab_report', 'document', 'other')),
  upload_status text not null default 'pending'
    check (upload_status in ('pending', 'uploading', 'uploaded', 'failed')),
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 500),
  captured_at timestamptz,
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1 check (server_version > 0),
  created_by_device_id uuid references public.vet_devices(id) on delete set null,
  last_modified_by_device_id uuid references public.vet_devices(id) on delete set null,
  -- An attachment that belongs to nothing is an orphan nobody will ever find.
  check (patient_id is not null or visit_id is not null),
  -- A file is only "uploaded" once the bytes and their checksum are both known.
  check (
    upload_status <> 'uploaded'
    or (uploaded_at is not null and checksum_sha256 is not null)
  ),
  unique (storage_bucket, storage_path)
);

create index attachments_vet_id_idx on public.attachments (vet_id) where deleted_at is null;
create index attachments_patient_idx on public.attachments (patient_id) where deleted_at is null;
create index attachments_visit_idx on public.attachments (visit_id) where deleted_at is null;
create index attachments_pending_idx on public.attachments (vet_id, upload_status)
  where upload_status <> 'uploaded' and deleted_at is null;

create trigger attachments_set_row_version
before update on public.attachments
for each row execute function app_private.set_row_version();

-- ---------------------------------------------------------------------------
-- Path ownership
-- ---------------------------------------------------------------------------

/**
 * Every storage path is "<vet_id>/<rest>". Deriving it server-side rather than
 * accepting one from the client is what stops a device writing into another
 * account's folder, whether by mistake or by traversal.
 */
create or replace function app_private.attachment_storage_path(
  p_vet_id uuid,
  p_attachment_id uuid,
  p_filename text
)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select p_vet_id::text || '/' || p_attachment_id::text || '/' ||
         regexp_replace(coalesce(nullif(trim(p_filename), ''), 'file'), '[^A-Za-z0-9._-]', '_', 'g')
$$;

revoke all on function app_private.attachment_storage_path(uuid, uuid, text) from public, anon, authenticated;

create or replace function app_private.enforce_attachment_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid;
begin
  if new.patient_id is not null then
    select vet_id into v_owner from public.patients where id = new.patient_id;
    if v_owner is null or v_owner <> new.vet_id then
      raise exception 'An attachment must belong to the same veterinarian as its animal'
        using errcode = '42501';
    end if;
  end if;

  if new.visit_id is not null then
    select vet_id into v_owner from public.visits where id = new.visit_id;
    if v_owner is null or v_owner <> new.vet_id then
      raise exception 'An attachment must belong to the same veterinarian as its visit'
        using errcode = '42501';
    end if;
  end if;

  -- The path prefix is the tenant boundary in storage. Letting it drift from
  -- vet_id would hand one account a readable path into another's files.
  if split_part(new.storage_path, '/', 1) <> new.vet_id::text then
    raise exception 'An attachment path must begin with its owning veterinarian'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger attachments_tenant_guard
before insert or update on public.attachments
for each row execute function app_private.enforce_attachment_tenant();

-- ---------------------------------------------------------------------------
-- Controlled RPCs
-- ---------------------------------------------------------------------------

/**
 * Registers an attachment before its bytes exist anywhere but the device.
 * Returns the storage path the client must upload to, so the client never
 * chooses its own location.
 */
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

  if p_attachment_type not in ('photo', 'radiograph', 'lab_report', 'document', 'other') then
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

create or replace function public.mark_attachment_uploading(
  p_id uuid,
  p_device_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  update public.attachments
  set upload_status = 'uploading',
      failure_reason = null,
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_id and vet_id = v_vet_id and upload_status <> 'uploaded' and deleted_at is null;

  if not found then
    raise exception 'Attachment not found or already uploaded' using errcode = 'P0002';
  end if;
end;
$$;

/**
 * Confirms the bytes arrived. Only after this does the device delete its copy,
 * so a failure anywhere earlier leaves the original where the vet can still
 * find it.
 */
create or replace function public.confirm_attachment_upload(
  p_id uuid,
  p_checksum_sha256 text,
  p_device_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  if p_checksum_sha256 is null or p_checksum_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'A SHA-256 checksum is required to confirm an upload' using errcode = '22023';
  end if;

  update public.attachments
  set upload_status = 'uploaded',
      checksum_sha256 = p_checksum_sha256,
      uploaded_at = now(),
      failure_reason = null,
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_id and vet_id = v_vet_id and deleted_at is null;

  if not found then
    raise exception 'Attachment not found' using errcode = 'P0002';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'attachment.uploaded', 'attachment', p_id, null,
    jsonb_build_object('checksum_sha256', p_checksum_sha256)
  );
end;
$$;

create or replace function public.mark_attachment_failed(
  p_id uuid,
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
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  update public.attachments
  set upload_status = 'failed',
      failure_reason = left(coalesce(nullif(trim(p_reason), ''), 'Upload failed'), 500),
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_id and vet_id = v_vet_id and upload_status <> 'uploaded' and deleted_at is null;

  if not found then
    raise exception 'Attachment not found or already uploaded' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS on the table
-- ---------------------------------------------------------------------------

alter table public.attachments enable row level security;

create policy attachments_select_own
on public.attachments
for select
to authenticated
using (vet_id = app_private.current_vet_id() and auth.jwt() ->> 'aal' = 'aal2');

revoke all on public.attachments from anon, authenticated;
grant select on public.attachments to authenticated;

grant execute on function public.register_attachment(uuid, text, text, bigint, text, uuid, uuid, timestamptz, uuid) to authenticated;
grant execute on function public.mark_attachment_uploading(uuid, uuid) to authenticated;
grant execute on function public.confirm_attachment_upload(uuid, text, uuid) to authenticated;
grant execute on function public.mark_attachment_failed(uuid, text, uuid) to authenticated;

revoke execute on function public.register_attachment(uuid, text, text, bigint, text, uuid, uuid, timestamptz, uuid) from public, anon;
revoke execute on function public.mark_attachment_uploading(uuid, uuid) from public, anon;
revoke execute on function public.confirm_attachment_upload(uuid, text, uuid) from public, anon;
revoke execute on function public.mark_attachment_failed(uuid, text, uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- RLS on storage itself
--
-- The table policies above govern the metadata. These govern the bytes, and
-- they are the ones that matter if a signed URL or a bucket name leaks: the
-- first path segment must be the caller's own vet_id, under MFA, in this bucket
-- only.
-- ---------------------------------------------------------------------------

create policy clinical_attachments_read_own
on storage.objects
for select
to authenticated
using (
  bucket_id = 'clinical-attachments'
  and auth.jwt() ->> 'aal' = 'aal2'
  and (storage.foldername(name))[1] = app_private.current_vet_id()::text
);

create policy clinical_attachments_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'clinical-attachments'
  and auth.jwt() ->> 'aal' = 'aal2'
  and (storage.foldername(name))[1] = app_private.current_vet_id()::text
);

-- Overwriting in place is how a resumed upload finishes, so update is allowed
-- within the caller's own folder and nowhere else.
create policy clinical_attachments_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'clinical-attachments'
  and auth.jwt() ->> 'aal' = 'aal2'
  and (storage.foldername(name))[1] = app_private.current_vet_id()::text
)
with check (
  bucket_id = 'clinical-attachments'
  and auth.jwt() ->> 'aal' = 'aal2'
  and (storage.foldername(name))[1] = app_private.current_vet_id()::text
);

-- No delete policy. Brief 8.2 keeps clinical material out of the tenant's
-- reach for hard deletion; removal follows the retention policy instead.

comment on table public.attachments is
  'Clinical files. Bytes live in the private clinical-attachments bucket under a path prefixed with vet_id; no public URL is ever stored.';
