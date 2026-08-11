begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('aa000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-close-a@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('aa000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-close-b@example.test', crypt('Strong-Test-Password-2!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (id, auth_user_id, full_name, phone_display, phone_e164) values
  ('ba000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'Vet Close A', '0243910001', '+233243910001'),
  ('ba000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000002', 'Vet Close B', '0243910002', '+233243910002');

-- Two sessions: one signed in a moment ago, one alive since last week behind a
-- refresh token. The second is the case this feature exists to refuse.
insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
  ('5e000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', now(), now(), 'aal2'),
  ('5e000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000001', now() - interval '7 days', now(), 'aal2'),
  ('5e000000-0000-0000-0000-000000000003', 'aa000000-0000-0000-0000-000000000002', now(), now(), 'aal2');

insert into public.vet_devices (id, vet_id, device_name, platform, app_version, last_authenticated_at, last_seen_at) values
  ('de000000-0000-0000-0000-000000000001', 'ba000000-0000-0000-0000-000000000001', 'Field phone', 'android', '0.1.0', now(), now()),
  ('de000000-0000-0000-0000-000000000002', 'ba000000-0000-0000-0000-000000000001', 'Office tablet', 'android', '0.1.0', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2","session_id":"5e000000-0000-0000-0000-000000000001"}', true);

select public.create_client(
  'ca000000-0000-0000-0000-000000000001', 'VK-C-CS0001', 'Closing Client',
  '024 391 0011', '+233243910011'
);
select public.create_patient(
  p_id => 'da000000-0000-0000-0000-000000000001',
  p_patient_code => 'VK-P-CS0001', p_name => 'Scout',
  p_species => 'dog', p_sex => 'male'
);
select public.create_visit(
  p_id => 'ea000000-0000-0000-0000-000000000001',
  p_patient_id => 'da000000-0000-0000-0000-000000000001',
  p_visit_date => now(), p_visit_type => 'home_call'
);

-- ---------------------------------------------------------------------------
-- The guards refuse before anything is destroyed (1-4)
-- ---------------------------------------------------------------------------

-- 1 A checkbox is too easy to hit by accident for something irreversible.
select throws_ok(
  $$select public.close_vet_account('yes')$$,
  '22023',
  'Type CLOSE MY ACCOUNT to confirm',
  'A wrong confirmation phrase refuses'
);

-- 2
select throws_ok(
  $$select public.close_vet_account(null)$$,
  '22023',
  'Type CLOSE MY ACCOUNT to confirm',
  'A missing confirmation refuses'
);

-- 3 The refusal must happen before any damage, not partway through.
select is(
  (select account_status from public.vets where id = 'ba000000-0000-0000-0000-000000000001'),
  'active',
  'A refused closure leaves the account untouched'
);

-- 4
select is(
  (select count(*)::int from public.vet_devices
   where vet_id = 'ba000000-0000-0000-0000-000000000001' and revoked_at is null),
  2,
  'A refused closure revokes nothing'
);

-- ---------------------------------------------------------------------------
-- A stale session cannot close the account (5-6)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2","session_id":"5e000000-0000-0000-0000-000000000002"}', true);

-- 5 A week-old login presents a freshly refreshed token; the session row is what
-- tells the truth about when the person actually authenticated.
select throws_ok(
  $$select public.close_vet_account('CLOSE MY ACCOUNT')$$,
  '42501',
  'Sign in again before making this change',
  'A session authenticated a week ago is refused'
);

-- 6 An unidentifiable session fails closed rather than open.
select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

select throws_ok(
  $$select public.close_vet_account('CLOSE MY ACCOUNT')$$,
  '42501',
  'Sign in again before making this change',
  'A token carrying no session is refused rather than trusted'
);

-- ---------------------------------------------------------------------------
-- Closing works, and does everything §17.2 asks (7-12)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2","session_id":"5e000000-0000-0000-0000-000000000001"}', true);

select lives_ok(
  $$select public.close_vet_account('  close my account  ', 'Leaving practice')$$,
  'A recent session with the typed phrase closes the account'
);

-- 8
select is(
  (select account_status from public.vets where id = 'ba000000-0000-0000-0000-000000000001'),
  'closed',
  'The account is closed'
);

-- 9
select ok(
  (select closed_at is not null from public.vets where id = 'ba000000-0000-0000-0000-000000000001'),
  'The moment of closure is recorded'
);

-- 10
select is(
  (select count(*)::int from public.vet_devices
   where vet_id = 'ba000000-0000-0000-0000-000000000001' and revoked_at is null),
  0,
  'Every device is revoked'
);

-- 11 The audit trail outlives the account; this is what answers the question
-- later.
select is(
  (select (metadata ->> 'clinical_records_retained')::int
   from public.audit_events
   where vet_id = 'ba000000-0000-0000-0000-000000000001' and action = 'account.closed'),
  1,
  'The audit entry records what was still held at the moment of closure'
);

-- 12
select is(
  (select reason from public.audit_events
   where vet_id = 'ba000000-0000-0000-0000-000000000001' and action = 'account.closed'),
  'Leaving practice',
  'The stated reason is kept'
);

-- ---------------------------------------------------------------------------
-- What a closed account can and cannot do (13-15)
-- ---------------------------------------------------------------------------

-- 13 Every controlled mutation is refused, without a single call site knowing
-- about closure.
select throws_ok(
  $$select public.create_client(
      'ca000000-0000-0000-0000-000000000009', 'VK-C-CS0009', 'After Closure',
      '024 391 0099', '+233243910099'
    )$$,
  '42501',
  'Active veterinarian account required',
  'A closed account cannot write anything new'
);

-- 14 Reads survive on purpose: a veterinarian who has closed may still need to
-- retrieve their own records, and §17.1's export will depend on it.
select is(
  (select count(*)::int from public.visits where vet_id = 'ba000000-0000-0000-0000-000000000001'),
  1,
  'The clinical record is retained and still readable by its owner'
);

-- 15 Closing twice is not an error. A retried request after a dropped
-- connection must not read as a failure.
select lives_ok(
  $$select public.close_vet_account('CLOSE MY ACCOUNT')$$,
  'Closing an already-closed account is a no-op rather than a failure'
);

-- ---------------------------------------------------------------------------
-- One account is not another (16)
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2","session_id":"5e000000-0000-0000-0000-000000000003"}', true);

-- 16
select is(
  (select account_status from public.vets where id = 'ba000000-0000-0000-0000-000000000002'),
  'active',
  'Closing one account leaves every other account alone'
);

reset role;

select * from finish();
rollback;
