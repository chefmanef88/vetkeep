-- Phase 4: the practice export (brief §17.1).
--
-- Account closure shipped without this, which meant a veterinarian could close
-- and keep nothing. That is the wrong order, and this closes it.
--
-- §17.1 asks for asynchronous generation through a job table with a short-lived
-- signed download link. The job table is here and earns its place; the async
-- worker is not, and the divergence is deliberate:
--
--   The reason a server-side worker is usually needed is binary attachments,
--   which cannot travel in a JSON response. But attachments already live in
--   Supabase Storage and the client already mints short-lived signed URLs for
--   them one at a time — see use-patient-photo.ts. So the export carries a
--   *manifest* and the files are fetched by the same mechanism that already
--   works, rather than a new Edge Function assembling a zip nobody has asked
--   for yet.
--
--   A solo practice is hundreds of rows, not millions. Building the JSON in one
--   call is honest at that size. When it stops being honest, the job table is
--   already the seam a worker plugs into: build_practice_export becomes the
--   worker's job rather than the caller's.
--
-- The job table is not ceremony. It is the record that a complete copy of a
-- practice's clinical data left the system, which is exactly the disclosure a
-- data protection regime asks you to be able to account for.

-- ---------------------------------------------------------------------------
-- The job
-- ---------------------------------------------------------------------------

create table if not exists public.export_jobs (
  id uuid primary key,
  vet_id uuid not null references public.vets(id) on delete restrict,
  status text not null default 'requested'
    check (status in ('requested', 'ready', 'downloaded', 'failed')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  downloaded_at timestamptz,
  -- What the export turned out to contain, so the audit trail records the size
  -- of the disclosure rather than merely that one happened.
  record_counts jsonb not null default '{}'::jsonb,
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 500),
  created_by_device_id uuid references public.vet_devices(id) on delete set null,
  check (jsonb_typeof(record_counts) = 'object')
);

create index if not exists export_jobs_vet_idx
  on public.export_jobs (vet_id, requested_at desc);

comment on table public.export_jobs is
  'A request for a complete copy of a practice (§17.1). The row is the record '
  'that clinical data left the system, and outlives the file itself.';

alter table public.export_jobs enable row level security;

drop policy if exists export_jobs_select_own on public.export_jobs;
create policy export_jobs_select_own
on public.export_jobs
for select
to authenticated
using (vet_id = app_private.current_vet_id() and auth.jwt() ->> 'aal' = 'aal2');

revoke all on public.export_jobs from anon, authenticated;
grant select on public.export_jobs to authenticated;

-- ---------------------------------------------------------------------------
-- Who may export
-- ---------------------------------------------------------------------------

-- Deliberately not require_active_vet(). A closed account must still be able to
-- take its data out — otherwise closure is a trap, and §17.2 step 3 ("offer data
-- export first") would be the only chance anyone ever got.
--
-- Suspension is different. That is a containment action taken by an
-- administrator, and letting a suspended account bulk-export everything is
-- precisely what containment is meant to prevent.
create or replace function app_private.require_exporting_vet()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_status text;
begin
  select id, account_status into v_vet_id, v_status
  from public.vets
  where auth_user_id = auth.uid()
  limit 1;

  if v_vet_id is null then
    raise exception 'Veterinarian profile required' using errcode = '42501';
  end if;

  if v_status = 'suspended' then
    raise exception 'This account is suspended' using errcode = '42501';
  end if;

  return v_vet_id;
end;
$$;

revoke all on function app_private.require_exporting_vet() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Requesting one
-- ---------------------------------------------------------------------------

create or replace function public.create_export_job(
  p_id uuid,
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
  v_vet_id := app_private.require_exporting_vet();

  insert into public.export_jobs (id, vet_id, created_by_device_id)
  values (p_id, v_vet_id, p_device_id)
  on conflict (id) do nothing;

  if not found then
    if exists (select 1 from public.export_jobs where id = p_id and vet_id = v_vet_id) then
      return p_id;
    end if;
    raise exception 'Export ID is unavailable' using errcode = '42501';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'export.requested', 'export_job', p_id, null, '{}'::jsonb
  );

  return p_id;
end;
$$;

revoke all on function public.create_export_job(uuid, uuid) from public, anon;
grant execute on function public.create_export_job(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Building it
-- ---------------------------------------------------------------------------

-- Everything §17.1 lists, in one document. Soft-deleted rows are included with
-- their deleted_at intact: this is the veterinarian's own copy of their own
-- practice, and silently dropping records they can still see in the application
-- would make the export quietly incomplete.
create or replace function public.build_practice_export(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_status text;
  v_payload jsonb;
  v_counts jsonb;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_exporting_vet();

  select status into v_status
  from public.export_jobs
  where id = p_job_id and vet_id = v_vet_id;

  if v_status is null then
    raise exception 'Export not found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'format_version', 1,
    'generated_at', now(),
    'practice', (
      select to_jsonb(v) - 'auth_user_id'
      from public.vets v where v.id = v_vet_id
    ),
    'clients', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at)
      from public.clients c where c.vet_id = v_vet_id
    ), '[]'::jsonb),
    'patients', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.created_at)
      from public.patients p where p.vet_id = v_vet_id
    ), '[]'::jsonb),
    'patient_owners', coalesce((
      select jsonb_agg(to_jsonb(po) order by po.valid_from)
      from public.patient_owners po where po.vet_id = v_vet_id
    ), '[]'::jsonb),
    'visits', coalesce((
      select jsonb_agg(to_jsonb(vi) order by vi.visit_date)
      from public.visits vi where vi.vet_id = v_vet_id
    ), '[]'::jsonb),
    'visit_amendments', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at)
      from public.visit_amendments a where a.vet_id = v_vet_id
    ), '[]'::jsonb),
    'physical_exam_findings', coalesce((
      select jsonb_agg(to_jsonb(f) order by f.visit_id, f.system_name)
      from public.physical_exam_findings f where f.vet_id = v_vet_id
    ), '[]'::jsonb),
    'treatments', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.administered_at)
      from public.treatments t where t.vet_id = v_vet_id
    ), '[]'::jsonb),
    'preventive_care', coalesce((
      select jsonb_agg(to_jsonb(pc) order by pc.date_given)
      from public.preventive_care pc where pc.vet_id = v_vet_id
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(to_jsonb(ii) order by ii.item_name)
      from public.inventory_items ii where ii.vet_id = v_vet_id
    ), '[]'::jsonb),
    'invoices', coalesce((
      select jsonb_agg(to_jsonb(iv) order by iv.created_at)
      from public.visit_invoices iv where iv.vet_id = v_vet_id
    ), '[]'::jsonb),
    'invoice_items', coalesce((
      select jsonb_agg(to_jsonb(it) order by it.invoice_id, it.sequence_number)
      from public.invoice_items it where it.vet_id = v_vet_id
    ), '[]'::jsonb),
    'invoice_payments', coalesce((
      select jsonb_agg(to_jsonb(pay) order by pay.paid_at)
      from public.invoice_payments pay where pay.vet_id = v_vet_id
    ), '[]'::jsonb),
    -- A manifest, not the bytes. The files stay in storage and the client mints
    -- a short-lived signed URL per file, which is the mechanism already in use
    -- for viewing an animal's photograph.
    'attachment_manifest', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', at.id,
        'patient_id', at.patient_id,
        'visit_id', at.visit_id,
        'storage_bucket', at.storage_bucket,
        'storage_path', at.storage_path,
        'original_filename', at.original_filename,
        'mime_type', at.mime_type,
        'size_bytes', at.size_bytes,
        'checksum_sha256', at.checksum_sha256,
        'attachment_type', at.attachment_type,
        'upload_status', at.upload_status,
        'captured_at', at.captured_at
      ) order by at.created_at)
      from public.attachments at where at.vet_id = v_vet_id
    ), '[]'::jsonb)
  ) into v_payload;

  select jsonb_build_object(
    'clients', jsonb_array_length(v_payload -> 'clients'),
    'patients', jsonb_array_length(v_payload -> 'patients'),
    'visits', jsonb_array_length(v_payload -> 'visits'),
    'treatments', jsonb_array_length(v_payload -> 'treatments'),
    'preventive_care', jsonb_array_length(v_payload -> 'preventive_care'),
    'invoices', jsonb_array_length(v_payload -> 'invoices'),
    'attachments', jsonb_array_length(v_payload -> 'attachment_manifest')
  ) into v_counts;

  update public.export_jobs
  set status = 'ready',
      completed_at = now(),
      record_counts = v_counts
  where id = p_job_id and vet_id = v_vet_id;

  perform app_private.insert_audit_event(
    v_vet_id, 'export.generated', 'export_job', p_job_id, null, v_counts
  );

  return v_payload;
end;
$$;

revoke all on function public.build_practice_export(uuid) from public, anon;
grant execute on function public.build_practice_export(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Recording that it left
-- ---------------------------------------------------------------------------

-- §17.1 asks for creation *and* download to be audited. Generating a payload and
-- saving a file to a phone are different events, and only the second one means
-- the data actually left the application.
create or replace function public.mark_export_downloaded(
  p_job_id uuid,
  p_device_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_status text;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_exporting_vet();

  select status into v_status
  from public.export_jobs
  where id = p_job_id and vet_id = v_vet_id;

  if v_status is null then
    raise exception 'Export not found' using errcode = 'P0002';
  end if;

  if v_status = 'requested' then
    raise exception 'This export has not been generated yet' using errcode = '22023';
  end if;

  update public.export_jobs
  set status = 'downloaded',
      downloaded_at = coalesce(downloaded_at, now())
  where id = p_job_id and vet_id = v_vet_id;

  perform app_private.insert_audit_event(
    v_vet_id, 'export.downloaded', 'export_job', p_job_id, null,
    jsonb_build_object('device_id', p_device_id)
  );
end;
$$;

revoke all on function public.mark_export_downloaded(uuid, uuid) from public, anon;
grant execute on function public.mark_export_downloaded(uuid, uuid) to authenticated;
