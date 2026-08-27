-- Closure keeps what a record needs to be attributable, and nothing else.
--
-- close_vet_account changed three columns: account_status, closed_at and
-- closure_reason. Everything else about the veterinarian survived indefinitely
-- — telephone number, WhatsApp number, business name, service areas — for a
-- person who had explicitly left.
--
-- The clinical records are retained for reasons that hold up: they document
-- treatments given to other people's animals, they carry the withholding
-- periods that say when milk and meat are safe again, and a signed record needs
-- a signer. None of those reasons reach a mobile number.
--
-- So attribution is kept and contact is cleared:
--
--   kept     full_name, license_number  — a signature attributable to nobody is
--                                         worth nothing, and the licence is how
--                                         a regulator identifies the signer
--   cleared  phone_display, phone_e164, whatsapp_display, whatsapp_e164,
--            business_name, service_areas
--
-- The argument that clinical retention is necessary is much easier to make when
-- everything unnecessary has visibly gone.

-- phone_display and phone_e164 were not null, which is right for an account
-- someone is using and wrong for one that has been closed. Nullable now, with a
-- constraint that permits it only after closure, so an active account still
-- cannot exist without a way to reach the veterinarian.
alter table public.vets alter column phone_display drop not null;
alter table public.vets alter column phone_e164 drop not null;

-- The existing vets_phone_display_check and vets_phone_e164_check are unchanged
-- and still apply: a check constraint passes on null, so they continue to
-- govern the values that are present without blocking their removal.
alter table public.vets
  drop constraint if exists vets_contact_present_unless_closed_check;

alter table public.vets
  add constraint vets_contact_present_unless_closed_check check (
    account_status = 'closed'
    or (phone_display is not null and phone_e164 is not null)
  );

comment on constraint vets_contact_present_unless_closed_check on public.vets is
  'Contact details are required while an account exists and removed when it '
  'closes. Attribution (full_name, license_number) is retained either way.';

-- Reproduced from the deployed definition with two statements changed: the
-- update now clears contact, and the audit entry records that it did. Every
-- guard, message and comment above them is as it was.
create or replace function public.close_vet_account(
  p_confirmation text,
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
  v_status text;
  v_devices integer;
  v_records integer;
begin
  perform app_private.require_aal2();

  select id, account_status into v_vet_id, v_status
  from public.vets
  where auth_user_id = auth.uid()
  limit 1;

  if v_vet_id is null then
    raise exception 'Veterinarian profile required' using errcode = '42501';
  end if;

  -- Closing an already-closed account is not an error. A retried request after a
  -- dropped connection must not read as a failure to the person who just made
  -- the hardest decision in the application.
  if v_status = 'closed' then
    return;
  end if;

  if v_status <> 'active' then
    raise exception 'Active veterinarian account required' using errcode = '42501';
  end if;

  perform app_private.require_recent_authentication();

  -- Typed in full, not a checkbox. The phrase is checked case-insensitively
  -- because the burden here should be deliberation, not typing accuracy.
  if upper(trim(coalesce(p_confirmation, ''))) <> 'CLOSE MY ACCOUNT' then
    raise exception 'Type CLOSE MY ACCOUNT to confirm' using errcode = '22023';
  end if;

  if p_reason is not null and char_length(trim(p_reason)) > 500 then
    raise exception 'Closure reason is too long' using errcode = '22023';
  end if;

  -- Counted before anything changes, so the audit entry records what was held at
  -- the moment of closure rather than what survives it.
  select count(*)::integer into v_records
  from public.visits
  where vet_id = v_vet_id and deleted_at is null;

  update public.vet_devices
  set revoked_at = now()
  where vet_id = v_vet_id and revoked_at is null;

  get diagnostics v_devices = row_count;

  update public.vets
  set account_status = 'closed',
      closed_at = now(),
      closure_reason = nullif(trim(p_reason), ''),
      -- Contact goes. full_name and license_number stay, because the records
      -- this person signed have to remain attributable to them.
      phone_display = null,
      phone_e164 = null,
      whatsapp_display = null,
      whatsapp_e164 = null,
      business_name = null,
      service_areas = '{}'
  where id = v_vet_id;

  -- The audit trail outlives the account, which is the point of it. This entry
  -- is what answers "when did they close, and what was still held" long after
  -- every session is gone.
  perform app_private.insert_audit_event(
    v_vet_id, 'account.closed', 'vet', v_vet_id, nullif(trim(p_reason), ''),
    jsonb_build_object(
      'devices_revoked', v_devices,
      'clinical_records_retained', v_records,
      -- Recorded because the erasure itself is a fact someone may later have to
      -- evidence: this is what shows the contact details were removed at
      -- closure rather than lost at some unknown point.
      'contact_details_cleared', true,
      'closed_at', now()
    )
  );
end;
$$;

comment on function public.close_vet_account(text, text, uuid) is
  'Closes the calling veterinarian''s account: revokes every device, clears '
  'contact details, and retains full_name, license_number and all clinical '
  'records so signed records stay attributable. Requires AAL2, recent '
  'authentication, and the phrase CLOSE MY ACCOUNT.';
