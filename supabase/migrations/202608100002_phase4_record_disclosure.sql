-- Phase 4: auditing the handing over of clinical records (brief §10.6).
--
-- Giving a client a copy is a disclosure. If a client later disputes what they
-- were told, "this record, shared on this date" is the answer, and it has to
-- exist before the dispute rather than be reconstructed after it.
--
-- What is recorded is the fact and the moment, never the document and never a
-- recipient. The phone hands the file to the operating system's share sheet and
-- does not learn where it went, so recording a recipient would be recording a
-- guess.
--
-- Two scopes: one signed record, or the folder's whole history when an animal
-- moves to another veterinarian.

drop function if exists public.record_record_disclosure(uuid, text, uuid);

create or replace function public.record_record_disclosure(
  p_patient_id uuid,
  p_scope text default 'single_record',
  p_visit_id uuid default null,
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
  v_status text;
  v_visit_patient uuid;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  if p_scope not in ('single_record', 'full_history') then
    raise exception 'Invalid disclosure scope' using errcode = '22023';
  end if;

  select true into v_owns_patient
  from public.patients
  where id = p_patient_id and vet_id = v_vet_id and deleted_at is null;

  if v_owns_patient is null then
    raise exception 'Folder not found' using errcode = 'P0002';
  end if;

  if p_scope = 'single_record' then
    if p_visit_id is null then
      raise exception 'A single record disclosure needs the record' using errcode = '22023';
    end if;

    select workflow_status, patient_id
    into v_status, v_visit_patient
    from public.visits
    where id = p_visit_id and vet_id = v_vet_id and deleted_at is null;

    if v_status is null then
      raise exception 'Record not found' using errcode = 'P0002';
    end if;

    -- Named separately from "not found" so a caller can tell a missing record
    -- from one belonging to a different animal.
    if v_visit_patient <> p_patient_id then
      raise exception 'That record belongs to a different folder' using errcode = '22023';
    end if;

    -- An open record is a draft. Handing a client a document that may still
    -- change misrepresents it as settled, so the audit refuses what the
    -- interface should never have offered.
    if v_status = 'draft' then
      raise exception 'An unsigned record cannot be given to a client' using errcode = '22023';
    end if;
  end if;

  perform app_private.insert_audit_event(
    v_vet_id,
    'record.disclosed',
    case when p_scope = 'single_record' then 'visit' else 'patient' end,
    coalesce(p_visit_id, p_patient_id),
    null,
    jsonb_build_object(
      'scope', p_scope,
      'patient_id', p_patient_id,
      'visit_id', p_visit_id,
      'device_id', p_device_id
    )
  );
end;
$$;

grant execute on function public.record_record_disclosure(uuid, text, uuid, uuid) to authenticated;
revoke execute on function public.record_record_disclosure(uuid, text, uuid, uuid) from public, anon;
