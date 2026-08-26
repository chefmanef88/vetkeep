-- Phase 4: preventive care is correctable (brief §7.7).
--
-- Vaccination, worming and parasite control could be created and deleted but
-- never corrected. A vet who typed the wrong batch number, or the wrong next-due
-- date, had one option: delete the entry and record it again — which loses the
-- original creation time and puts a deletion in the audit trail for what was a
-- typing mistake.
--
-- The rule follows the one the rest of the product already uses. A record stays
-- editable until it is signed, and then it stops:
--
--   * Preventive care standing on its own, or attached to a draft, is editable.
--   * The moment its consultation is signed, it is part of a signed clinical
--     record and locked with it. §8.2 does not carve out an exception for a
--     vaccine, and neither does this.
--
-- Optimistic concurrency matches every other update in the schema: the caller
-- sends the version it read, and a stale write is refused rather than applied
-- over somebody else's correction.

create or replace function public.update_preventive_care(
  p_id uuid,
  p_product_name text,
  p_date_given date,
  p_vaccine_type text default null,
  p_manufacturer text default null,
  p_batch_lot_number text default null,
  p_dose text default null,
  p_route text default null,
  p_animals_treated integer default null,
  p_next_due_date date default null,
  p_notes text default null,
  p_target_parasites text[] default null,
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
  v_kind text;
  v_visit_status text;
  v_current bigint;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  select pc.kind, pc.server_version, v.workflow_status
  into v_kind, v_current, v_visit_status
  from public.preventive_care pc
  left join public.visits v on v.id = pc.visit_id
  where pc.id = p_id and pc.vet_id = v_vet_id and pc.deleted_at is null;

  if v_kind is null then
    raise exception 'Preventive care not found' using errcode = 'P0002';
  end if;

  -- Attached to a signed consultation, it is part of that signed record. A
  -- correction there is an amendment to the record, not an edit of a row.
  if v_visit_status is not null and v_visit_status <> 'draft' then
    raise exception 'This record is signed and can no longer be changed'
      using errcode = '42501';
  end if;

  -- The same validations the create path applies. A correction must not be able
  -- to reach a state that could never have been created.
  if char_length(trim(coalesce(p_product_name, ''))) not between 1 and 160 then
    raise exception 'Name the product that was given' using errcode = '22023';
  end if;

  if p_date_given is null then
    raise exception 'A date given is required' using errcode = '22023';
  end if;

  if p_date_given > (now() at time zone 'UTC')::date then
    raise exception 'A date given cannot be in the future' using errcode = '22023';
  end if;

  if v_kind = 'vaccination' and p_vaccine_type is null then
    raise exception 'Choose which vaccine was given' using errcode = '22023';
  end if;

  if v_kind = 'deworming' and p_vaccine_type is not null then
    raise exception 'A dewormer does not carry a vaccine type' using errcode = '22023';
  end if;

  if v_kind = 'ectoparasite_control' and p_vaccine_type is not null then
    raise exception 'Parasite control does not carry a vaccine type' using errcode = '22023';
  end if;

  if v_kind <> 'ectoparasite_control' and p_target_parasites is not null then
    raise exception 'Only ectoparasite control targets a parasite' using errcode = '22023';
  end if;

  if p_target_parasites is not null
     and not (p_target_parasites <@ array['ticks', 'fleas', 'mites', 'lice', 'flies', 'other']::text[]) then
    raise exception 'Invalid parasite' using errcode = '22023';
  end if;

  if p_next_due_date is not null and p_next_due_date < p_date_given then
    raise exception 'The next dose cannot be due before the one just given' using errcode = '22023';
  end if;

  perform app_private.assert_fresh(p_base_server_version, v_current, 'preventive care entry');

  update public.preventive_care
  set product_name = trim(p_product_name),
      date_given = p_date_given,
      vaccine_type = p_vaccine_type,
      manufacturer = nullif(trim(p_manufacturer), ''),
      batch_lot_number = nullif(trim(p_batch_lot_number), ''),
      dose = nullif(trim(p_dose), ''),
      route = p_route,
      animals_treated = p_animals_treated,
      next_due_date = p_next_due_date,
      notes = nullif(trim(p_notes), ''),
      target_parasites = p_target_parasites,
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_id and vet_id = v_vet_id and deleted_at is null;

  if not found then
    raise exception 'Preventive care not found' using errcode = 'P0002';
  end if;

  -- Corrections are audited. "Which batch did you write first?" is a question
  -- somebody eventually asks about a vaccine.
  perform app_private.insert_audit_event(
    v_vet_id, 'preventive_care.updated', 'preventive_care', p_id, null,
    jsonb_build_object('kind', v_kind, 'date_given', p_date_given)
  );
end;
$$;

revoke all on function public.update_preventive_care(
  uuid, text, date, text, text, text, text, text, integer, date, text, text[], uuid, bigint
) from public, anon;
grant execute on function public.update_preventive_care(
  uuid, text, date, text, text, text, text, text, integer, date, text, text[], uuid, bigint
) to authenticated;

comment on function public.update_preventive_care(
  uuid, text, date, text, text, text, text, text, integer, date, text, text[], uuid, bigint
) is
  'Corrects a vaccination, worming or parasite control entry. Refused once the '
  'consultation it belongs to is signed, because it is then part of a signed '
  'clinical record (§8.2). The kind itself never changes: a vaccination that '
  'was meant to be a worming is a wrong entry, not a mistyped one.';
