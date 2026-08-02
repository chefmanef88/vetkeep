-- VetKeep Phase 3: auditing conflict resolutions.
--
-- Brief 15.6 ends with "conflict resolution itself creates a new audited
-- mutation". The write that follows a resolution is already audited by its own
-- RPC, but as an ordinary update: nothing in the trail says two devices
-- disagreed about an animal's treatment and a human chose between them.
--
-- That distinction is the point. A record that was contested and resolved has a
-- different standing from one nobody ever disputed, and if the question is ever
-- raised months later the trail has to show which it was.

create or replace function public.record_conflict_resolution(
  p_entity_type text,
  p_entity_id uuid,
  p_resolution text,
  p_fields text[] default '{}',
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

  if p_entity_type is null or char_length(trim(p_entity_type)) not between 2 and 100 then
    raise exception 'Invalid entity type' using errcode = '22023';
  end if;

  if p_resolution not in ('keep_local', 'keep_server', 'combined') then
    raise exception 'Invalid conflict resolution' using errcode = '22023';
  end if;

  -- Field names only, never their values. Brief 16.3: clinical note bodies are
  -- not written to logs or audit metadata, and the contested text is exactly
  -- the kind of prose that rule exists for.
  if cardinality(coalesce(p_fields, '{}')) > 50 then
    raise exception 'Too many fields in one resolution' using errcode = '22023';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id,
    'sync.conflict_resolved',
    trim(p_entity_type),
    p_entity_id,
    null,
    jsonb_build_object(
      'resolution', p_resolution,
      'fields', coalesce(p_fields, '{}'),
      'device_id', p_device_id
    )
  );
end;
$$;

grant execute on function public.record_conflict_resolution(text, uuid, text, text[], uuid) to authenticated;
revoke execute on function public.record_conflict_resolution(text, uuid, text, text[], uuid) from public, anon;
