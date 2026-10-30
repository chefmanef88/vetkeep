-- Removing an attachment.
--
-- A vet photographs the wrong animal, or catches their own thumb, or attaches a
-- clip to the wrong consultation. Until now there was no way back: the
-- attachment machinery could register, upload and confirm, and nothing could
-- ever take one off a record. The only remedy was to leave it there.
--
-- This is a soft delete and only a soft delete. Brief 8.2 is explicit that
-- clinical material is not erased through the tenant application: a draft may
-- be soft-deleted, a signed record is voided rather than erased, and the bytes
-- follow the retention policy rather than a button. So deleted_at is set, the
-- row stays, the object stays in the bucket, and an audit event records who did
-- it and why.
--
-- The gate is the same one visits use. An attachment on a draft consultation
-- can be withdrawn, because an unsigned record was never a record. An
-- attachment on a signed one cannot, because by then it is part of what was
-- signed — the remedy there is to void the record, which keeps both the
-- original and the reason.
--
-- A folder photograph belongs to no consultation and is always removable: it is
-- identification, not a clinical finding, and a picture of the wrong animal on
-- a folder is worse than no picture at all.

create or replace function public.delete_attachment(
  p_id uuid,
  p_reason text default null,
  p_device_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_visit_id uuid;
  v_patient_id uuid;
  v_status text;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  select a.visit_id, a.patient_id
  into v_visit_id, v_patient_id
  from public.attachments a
  where a.id = p_id and a.vet_id = v_vet_id and a.deleted_at is null;

  if not found then
    raise exception 'Attachment not found' using errcode = 'P0002';
  end if;

  -- Attached to a consultation: only while that consultation is still a draft.
  if v_visit_id is not null then
    select v.workflow_status into v_status
    from public.visits v
    where v.id = v_visit_id and v.vet_id = v_vet_id;

    if v_status is distinct from 'draft' then
      raise exception
        'This consultation has been signed, so its attachments cannot be removed. Void the record instead.'
        using errcode = '42501';
    end if;
  end if;

  update public.attachments
  set
    deleted_at = now(),
    updated_at = now(),
    last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_id and vet_id = v_vet_id;

  -- A folder pointing at a removed photograph would render as a broken image on
  -- every screen the animal appears on, so the reference goes with it. Done
  -- here rather than left to the caller: the two must not be able to disagree.
  update public.patients
  set profile_photo_attachment_id = null
  where vet_id = v_vet_id and profile_photo_attachment_id = p_id;

  -- The reason goes in the column that exists for it rather than into the
  -- metadata blob. Brief 8.2 requires each of the three deletion actions to
  -- write an audit event carrying its reason, and a reason that can only be
  -- found by digging through JSON is one nobody will find.
  perform app_private.insert_audit_event(
    v_vet_id, 'attachment.deleted', 'attachment', p_id,
    nullif(trim(coalesce(p_reason, '')), ''),
    jsonb_build_object('visit_id', v_visit_id, 'patient_id', v_patient_id)
  );
end;
$$;

revoke all on function public.delete_attachment(uuid, text, uuid) from public;
grant execute on function public.delete_attachment(uuid, text, uuid) to authenticated;

comment on function public.delete_attachment(uuid, text, uuid) is
  'Soft-deletes an attachment. The bytes stay in the bucket under the retention policy; only the reference is withdrawn, and only from a draft consultation or a folder picture.';
