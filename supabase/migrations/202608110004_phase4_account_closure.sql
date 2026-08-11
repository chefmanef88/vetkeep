-- Phase 4: account closure (brief §17.2).
--
-- Apple has required an in-app way to delete an account since 2022 for any app
-- that lets someone create one, so this is a condition of shipping at all. It is
-- also the hardest thing in the product to get right, because two duties pull in
-- opposite directions:
--
--   A person may withdraw and expect their account to stop existing.
--   A signed clinical record is not erasable — §8.2 already forbids it, and a
--   withholding date somebody is relying on does not stop mattering because the
--   veterinarian closed their account.
--
-- The resolution here is the ordinary one in clinical software: the *account* is
-- closed, and the *clinical record* is retained under a stated policy. What this
-- migration must not do is pretend to decide that policy. The retention period
-- is a legal question for Ghana's Data Protection Act and the Veterinary
-- Council, and it belongs in the published privacy notice. This code enforces
-- the mechanism and records the decision; it does not invent it.
--
-- What closure does here:
--   1. requires a session that was authenticated recently, not merely a valid one
--   2. requires the veterinarian to type a confirmation phrase
--   3. revokes every registered device
--   4. stops all new activity, through the account_status gate that already exists
--   5. retains clinical records, and says so in the audit trail
--
-- Reads deliberately survive. Phase 1 was accepted on "active-account mutation
-- enforcement while preserving read access", and a veterinarian who has closed
-- their account may still need to retrieve their own records during whatever
-- grace period the policy sets. Closure removes the ability to write, not the
-- ability to look.

-- ---------------------------------------------------------------------------
-- What was recorded about the closure
-- ---------------------------------------------------------------------------

alter table public.vets
  add column if not exists closed_at timestamptz,
  add column if not exists closure_reason text;

alter table public.vets
  drop constraint if exists vets_closure_reason_length_check,
  drop constraint if exists vets_closure_pair_check;

alter table public.vets
  add constraint vets_closure_reason_length_check
    check (closure_reason is null or char_length(trim(closure_reason)) <= 500),
  -- A closed account always carries the moment it closed; an open one never
  -- does. Without this the column becomes a field nobody can trust.
  add constraint vets_closure_pair_check
    check (
      (account_status = 'closed' and closed_at is not null)
      or (account_status <> 'closed' and closed_at is null)
    );

comment on column public.vets.closed_at is
  'When the veterinarian closed their own account (§17.2). Suspension by an '
  'administrator is a different state and does not set this.';

-- ---------------------------------------------------------------------------
-- Recent authentication
-- ---------------------------------------------------------------------------

-- A destructive, irreversible action should not ride on a session that has been
-- alive for a fortnight behind a refresh token.
--
-- The JWT's own `iat` cannot answer this: it is reset every time the token
-- refreshes, so a week-old login presents a two-minute-old `iat`. The session
-- row carries the real sign-in time, which is the thing worth checking.
create or replace function app_private.require_recent_authentication(
  p_max_age interval default interval '15 minutes'
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_session_id uuid;
  v_created_at timestamptz;
begin
  begin
    v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when others then
    v_session_id := null;
  end;

  -- No identifiable session is a reason to refuse, never a reason to wave
  -- through. This fails closed on purpose.
  if v_session_id is null then
    raise exception 'Sign in again before making this change' using errcode = '42501';
  end if;

  select s.created_at into v_created_at
  from auth.sessions s
  where s.id = v_session_id;

  if v_created_at is null or v_created_at < now() - p_max_age then
    raise exception 'Sign in again before making this change' using errcode = '42501';
  end if;
end;
$$;

revoke all on function app_private.require_recent_authentication(interval)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Closing the account
-- ---------------------------------------------------------------------------

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
      closure_reason = nullif(trim(p_reason), '')
  where id = v_vet_id;

  -- The audit trail outlives the account, which is the point of it. This entry
  -- is what answers "when did they close, and what was still held" long after
  -- every session is gone.
  perform app_private.insert_audit_event(
    v_vet_id, 'account.closed', 'vet', v_vet_id, nullif(trim(p_reason), ''),
    jsonb_build_object(
      'devices_revoked', v_devices,
      'clinical_records_retained', v_records,
      'closed_at', now()
    )
  );
end;
$$;

revoke all on function public.close_vet_account(text, text, uuid) from public, anon;
grant execute on function public.close_vet_account(text, text, uuid) to authenticated;

comment on function public.close_vet_account(text, text, uuid) is
  'Closes the calling veterinarian''s own account (§17.2): revokes every device '
  'and stops all new activity. Clinical records are retained under the published '
  'retention policy, which is a legal decision and not encoded here. Requires '
  'AAL2, a recently authenticated session, and a typed confirmation.';

-- ---------------------------------------------------------------------------
-- What a closed account can still do
-- ---------------------------------------------------------------------------

-- Nothing is changed here, and that is deliberate enough to write down.
--
-- require_active_vet() already refuses every controlled mutation once the status
-- leaves 'active', so closure disables new activity across the whole application
-- without a single call site being touched. The RLS select policies test
-- current_vet_id() rather than the status, so reads continue to work — which is
-- what lets a veterinarian retrieve their own records after closing, and what
-- §17.1's export will depend on when it is built.
--
-- Public passports (§10) must be revoked on closure too. That section is not
-- built; whoever builds it adds the revocation here rather than in a new place.
