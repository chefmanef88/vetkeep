begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('aa000000-0000-0000-0000-0000000000c1'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-consent-a@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('aa000000-0000-0000-0000-0000000000c2'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-consent-b@example.test', crypt('Strong-Test-Password-2!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (id, auth_user_id, full_name, phone_display, phone_e164) values
  ('ba000000-0000-0000-0000-0000000000c1'::uuid, 'aa000000-0000-0000-0000-0000000000c1'::uuid, 'Vet Consent A', '0243910071', '+233243910071'),
  ('ba000000-0000-0000-0000-0000000000c2'::uuid, 'aa000000-0000-0000-0000-0000000000c2'::uuid, 'Vet Consent B', '0243910072', '+233243910072');

insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
  ('5e000000-0000-0000-0000-0000000000c1'::uuid, 'aa000000-0000-0000-0000-0000000000c1'::uuid, now(), now(), 'aal2'),
  ('5e000000-0000-0000-0000-0000000000c2'::uuid, 'aa000000-0000-0000-0000-0000000000c2'::uuid, now(), now(), 'aal2');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa000000-0000-0000-0000-0000000000c1', true);
select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-0000000000c1","role":"authenticated","aal":"aal2","session_id":"5e000000-0000-0000-0000-0000000000c1"}', true);

select public.create_client(
  'ca000000-0000-0000-0000-0000000000c1'::uuid, 'VK-C-CN0001', 'Consent Owner',
  '024 391 0073', '+233243910073'
);
select public.create_patient(
  p_id => 'da000000-0000-0000-0000-0000000000c1'::uuid,
  p_patient_code => 'VK-P-CN0001', p_name => 'Nala',
  p_species => 'dog', p_sex => 'female'
);
select public.create_visit(
  p_id => 'ea000000-0000-0000-0000-0000000000c1'::uuid,
  p_patient_id => 'da000000-0000-0000-0000-0000000000c1'::uuid,
  p_visit_date => now(), p_visit_type => 'clinic_visit'
);
select public.record_surgical_procedure(
  p_id => 'fa000000-0000-0000-0000-0000000000c1'::uuid,
  p_visit_id => 'ea000000-0000-0000-0000-0000000000c1'::uuid,
  p_procedure_name => 'Ovariohysterectomy',
  p_procedure_kind => 'routine',
  p_anaesthesia => 'general',
  p_induction_agent => 'Propofol 4 mg/kg IV'
);

-- A second consultation, to prove a consent cannot be filed against a
-- procedure that belongs to a different one.
select public.create_visit(
  p_id => 'ea000000-0000-0000-0000-0000000000c2'::uuid,
  p_patient_id => 'da000000-0000-0000-0000-0000000000c1'::uuid,
  p_visit_date => now(), p_visit_type => 'follow_up'
);

-- ---------------------------------------------------------------------------
-- Recording one (1-4)
-- ---------------------------------------------------------------------------

-- 1
select lives_ok(
  $$select public.record_consent(
      p_id => 'c0000000-0000-0000-0000-0000000000c1'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000c1'::uuid,
      p_consent_for => 'surgery',
      p_surgical_procedure_id => 'fa000000-0000-0000-0000-0000000000c1'::uuid,
      p_granted_by_name => 'Ama Mensah',
      p_granted_by_capacity => 'owner',
      p_method => 'verbal',
      p_risks_explained => 'Anaesthetic risk, bleeding, wound breakdown, and the cost were explained.'
    )$$,
  'A surgical consent is recorded against its procedure'
);

-- 2 The capacity is recorded, not assumed from the folder's client. Whether
-- this person could consent is what a dispute turns on.
select is(
  (select granted_by_capacity from public.consents where id = 'c0000000-0000-0000-0000-0000000000c1'::uuid),
  'owner',
  'The capacity the person consented in is kept'
);

-- 3
select lives_ok(
  $$select public.record_consent(
      p_id => 'c0000000-0000-0000-0000-0000000000c2'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000c1'::uuid,
      p_consent_for => 'surgery',
      p_surgical_procedure_id => 'fa000000-0000-0000-0000-0000000000c1'::uuid,
      p_granted_by_name => 'Kwame Boateng',
      p_granted_by_capacity => 'keeper',
      p_method => 'verbal_witnessed',
      p_witness_name => 'Yaw Darko',
      p_risks_explained => 'Explained in Twi, in front of the herdsman, before the animal was cast.'
    )$$,
  'A witnessed verbal consent is recorded with its witness'
);

-- 4 A replayed sync is not an error.
select lives_ok(
  $$select public.record_consent(
      p_id => 'c0000000-0000-0000-0000-0000000000c1'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000c1'::uuid,
      p_consent_for => 'surgery',
      p_surgical_procedure_id => 'fa000000-0000-0000-0000-0000000000c1'::uuid,
      p_granted_by_name => 'Ama Mensah',
      p_granted_by_capacity => 'owner',
      p_method => 'verbal',
      p_risks_explained => 'Anaesthetic risk, bleeding, wound breakdown, and the cost were explained.'
    )$$,
  'Sending the same consent twice is not an error'
);

-- ---------------------------------------------------------------------------
-- What is refused (5-10)
-- ---------------------------------------------------------------------------

-- 5 The substance. A consent that does not say what was explained is a
-- signature on a blank page.
select throws_ok(
  $$select public.record_consent(
      p_id => 'c0000000-0000-0000-0000-0000000000c3'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000c1'::uuid,
      p_consent_for => 'surgery',
      p_surgical_procedure_id => 'fa000000-0000-0000-0000-0000000000c1'::uuid,
      p_granted_by_name => 'Ama Mensah',
      p_granted_by_capacity => 'owner',
      p_method => 'verbal',
      p_risks_explained => 'ok'
    )$$,
  '22023',
  'Record what was explained to them',
  'A consent with nothing explained is refused'
);

-- 6
select throws_ok(
  $$select public.record_consent(
      p_id => 'c0000000-0000-0000-0000-0000000000c4'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000c1'::uuid,
      p_consent_for => 'surgery',
      p_surgical_procedure_id => 'fa000000-0000-0000-0000-0000000000c1'::uuid,
      p_granted_by_name => 'Ama Mensah',
      p_granted_by_capacity => 'owner',
      p_method => 'verbal_witnessed',
      p_risks_explained => 'Anaesthetic risk and bleeding were explained at length.'
    )$$,
  '22023',
  'A witnessed consent needs the witness named',
  'A witnessed consent without a witness is refused'
);

-- 7
select throws_ok(
  $$select public.record_consent(
      p_id => 'c0000000-0000-0000-0000-0000000000c5'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000c1'::uuid,
      p_consent_for => 'surgery',
      p_granted_by_name => 'Ama Mensah',
      p_granted_by_capacity => 'owner',
      p_method => 'verbal',
      p_risks_explained => 'Anaesthetic risk and bleeding were explained at length.'
    )$$,
  '22023',
  'A surgical consent names the procedure it is for',
  'A surgical consent with no procedure is refused'
);

-- 8
select throws_ok(
  $$select public.record_consent(
      p_id => 'c0000000-0000-0000-0000-0000000000c6'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000c1'::uuid,
      p_consent_for => 'surgery',
      p_surgical_procedure_id => 'fa000000-0000-0000-0000-0000000000c1'::uuid,
      p_granted_by_name => 'Ama Mensah',
      p_granted_by_capacity => 'bystander',
      p_method => 'verbal',
      p_risks_explained => 'Anaesthetic risk and bleeding were explained at length.'
    )$$,
  '22023',
  'Invalid capacity',
  'An unrecognised capacity is refused'
);

-- 9 A consent filed against a procedure from another consultation would pass
-- every tenant check and still be attached to the wrong operation.
select throws_ok(
  $$select public.record_consent(
      p_id => 'c0000000-0000-0000-0000-0000000000c7'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000c2'::uuid,
      p_consent_for => 'surgery',
      p_surgical_procedure_id => 'fa000000-0000-0000-0000-0000000000c1'::uuid,
      p_granted_by_name => 'Ama Mensah',
      p_granted_by_capacity => 'owner',
      p_method => 'verbal',
      p_risks_explained => 'Anaesthetic risk and bleeding were explained at length.'
    )$$,
  '42501',
  'Procedure does not belong to this consultation',
  'A consent cannot be filed against another consultation''s procedure'
);

-- 10 Another practice's consultation is not somewhere to file a consent.
select set_config('request.jwt.claim.sub', 'aa000000-0000-0000-0000-0000000000c2', true);
select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-0000000000c2","role":"authenticated","aal":"aal2","session_id":"5e000000-0000-0000-0000-0000000000c2"}', true);

select throws_ok(
  $$select public.record_consent(
      p_id => 'c0000000-0000-0000-0000-0000000000c8'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000c1'::uuid,
      p_consent_for => 'surgery',
      p_surgical_procedure_id => 'fa000000-0000-0000-0000-0000000000c1'::uuid,
      p_granted_by_name => 'Ama Mensah',
      p_granted_by_capacity => 'owner',
      p_method => 'verbal',
      p_risks_explained => 'Anaesthetic risk and bleeding were explained at length.'
    )$$,
  'P0002',
  'Consultation not found',
  'Another practice cannot file a consent here'
);

-- 11
select is(
  (select count(*)::int from public.consents),
  0,
  'Another practice sees none of these consents'
);

select set_config('request.jwt.claim.sub', 'aa000000-0000-0000-0000-0000000000c1', true);
select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-0000000000c1","role":"authenticated","aal":"aal2","session_id":"5e000000-0000-0000-0000-0000000000c1"}', true);

-- ---------------------------------------------------------------------------
-- Immutability — the whole point of the table (12-15)
-- ---------------------------------------------------------------------------

-- The table is read-only to clients, so these run as owner: the question is
-- whether the trigger holds, not whether the grant does. Both are tested, but
-- they are different guarantees and a grant can be widened by a later
-- migration without anyone noticing the trigger was the real protection.
reset role;

-- 12 Rewriting what was explained is the forgery this table exists to prevent.
select throws_ok(
  $$update public.consents
    set risks_explained = 'Something entirely different was explained.'
    where id = 'c0000000-0000-0000-0000-0000000000c1'::uuid$$,
  '42501',
  'A consent record cannot be altered once given',
  'What was explained cannot be rewritten afterwards'
);

-- 13
select throws_ok(
  $$update public.consents
    set granted_by_name = 'Someone Else'
    where id = 'c0000000-0000-0000-0000-0000000000c1'::uuid$$,
  '42501',
  'A consent record cannot be altered once given',
  'Who consented cannot be changed afterwards'
);

-- 14
select throws_ok(
  $$update public.consents
    set granted_at = now() - interval '3 days'
    where id = 'c0000000-0000-0000-0000-0000000000c1'::uuid$$,
  '42501',
  'A consent record cannot be altered once given',
  'When consent was given cannot be backdated'
);

-- 15 Moving a consent onto a different procedure would make it evidence for
-- an operation nobody agreed to.
select throws_ok(
  $$update public.consents
    set surgical_procedure_id = null
    where id = 'c0000000-0000-0000-0000-0000000000c1'::uuid$$,
  '42501',
  'A consent record cannot be altered once given',
  'A consent cannot be moved off the procedure it was given for'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-0000000000c1","role":"authenticated","aal":"aal2","session_id":"5e000000-0000-0000-0000-0000000000c1"}', true);

-- ---------------------------------------------------------------------------
-- Withdrawal is a new fact, not an edit (16-18)
-- ---------------------------------------------------------------------------

-- 16
select lives_ok(
  $$select public.withdraw_consent(
      'c0000000-0000-0000-0000-0000000000c2'::uuid,
      'Owner changed their mind before the animal was cast.'
    )$$,
  'Consent can be withdrawn'
);

-- 17 The original stands beside the withdrawal rather than being replaced.
select ok(
  (select withdrawn_at is not null and risks_explained is not null
   from public.consents where id = 'c0000000-0000-0000-0000-0000000000c2'::uuid),
  'The withdrawal is recorded and what was originally explained survives it'
);

-- 18 Withdrawing twice must not overwrite the first reason: when it was
-- withdrawn is itself part of the record.
select lives_ok(
  $$select public.withdraw_consent(
      'c0000000-0000-0000-0000-0000000000c2'::uuid,
      'A different reason entirely'
    )$$,
  'Withdrawing an already-withdrawn consent is not an error'
);

select * from finish();
rollback;
