begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('aa000000-0000-0000-0000-0000000000e9'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-euth@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (id, auth_user_id, full_name, phone_display, phone_e164) values
  ('ba000000-0000-0000-0000-0000000000e9'::uuid, 'aa000000-0000-0000-0000-0000000000e9'::uuid, 'Vet Euth', '0243910081', '+233243910081');

insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
  ('5e000000-0000-0000-0000-0000000000e9'::uuid, 'aa000000-0000-0000-0000-0000000000e9'::uuid, now(), now(), 'aal2');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa000000-0000-0000-0000-0000000000e9', true);
select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-0000000000e9","role":"authenticated","aal":"aal2","session_id":"5e000000-0000-0000-0000-0000000000e9"}', true);

select public.create_client(
  'ca000000-0000-0000-0000-0000000000e9'::uuid, 'VK-C-E90001', 'Euth Owner',
  '024 391 0082', '+233243910082'
);
select public.create_patient(
  p_id => 'da000000-0000-0000-0000-0000000000e9'::uuid,
  p_patient_code => 'VK-P-E90001', p_name => 'Bella',
  p_species => 'dog', p_sex => 'female'
);
select public.create_patient(
  p_id => 'da000000-0000-0000-0000-0000000000ea'::uuid,
  p_patient_code => 'VK-P-E90002', p_name => 'Cull pen',
  p_species => 'poultry', p_kind => 'group', p_purpose => 'eggs',
  p_head_count => 200
);
select public.create_visit(
  p_id => 'ea000000-0000-0000-0000-0000000000e9'::uuid,
  p_patient_id => 'da000000-0000-0000-0000-0000000000e9'::uuid,
  p_visit_date => now(), p_visit_type => 'home_call'
);
select public.create_visit(
  p_id => 'ea000000-0000-0000-0000-0000000000ea'::uuid,
  p_patient_id => 'da000000-0000-0000-0000-0000000000ea'::uuid,
  p_visit_date => now(), p_visit_type => 'field_visit'
);

-- ---------------------------------------------------------------------------
-- Recording one, and what it does to the folder (1-4)
-- ---------------------------------------------------------------------------

-- 1
select lives_ok(
  $$select public.record_euthanasia(
      p_id => 'ed000000-0000-0000-0000-0000000000e1'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000e9'::uuid,
      p_reason => 'poor_prognosis',
      p_reason_detail => 'Advanced renal failure, not responding to fluids, deteriorating over four days.',
      p_method => 'injectable',
      p_agent => 'Pentobarbital 150 mg/kg IV',
      p_death_confirmed => true,
      p_death_confirmed_by => 'Absent heartbeat and corneal reflex after five minutes'
    )$$,
  'A euthanasia is recorded with its reason, agent and confirmation'
);

-- 2 The folder ends here. The next person to open it must not read it as a
-- live case.
select is(
  (select status from public.patients where id = 'da000000-0000-0000-0000-0000000000e9'::uuid),
  'deceased',
  'The animal is marked deceased in the same transaction'
);

-- 3 An animal is euthanised once. A second record is a mistake, not a second
-- death, and the message says so rather than naming an index.
select throws_ok(
  $$select public.record_euthanasia(
      p_id => 'ed000000-0000-0000-0000-0000000000e2'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000e9'::uuid,
      p_reason => 'suffering',
      p_reason_detail => 'A second record against the same animal, which should be refused.',
      p_method => 'injectable',
      p_agent => 'Pentobarbital'
    )$$,
  '22023',
  'This animal is already recorded as euthanised',
  'An animal cannot be euthanised twice'
);

-- 4 A replayed sync is not an error.
select lives_ok(
  $$select public.record_euthanasia(
      p_id => 'ed000000-0000-0000-0000-0000000000e1'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000e9'::uuid,
      p_reason => 'poor_prognosis',
      p_reason_detail => 'Advanced renal failure, not responding to fluids, deteriorating over four days.',
      p_method => 'injectable',
      p_agent => 'Pentobarbital 150 mg/kg IV'
    )$$,
  'Sending the same euthanasia twice is not an error'
);

-- ---------------------------------------------------------------------------
-- What is refused (5-10)
-- ---------------------------------------------------------------------------

-- 5 The reason category alone is never the whole story, and this is the record
-- a vet may have to defend.
select throws_ok(
  $$select public.record_euthanasia(
      p_id => 'ed000000-0000-0000-0000-0000000000e3'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000ea'::uuid,
      p_reason => 'suffering',
      p_reason_detail => 'bad',
      p_method => 'captive_bolt'
    )$$,
  '22023',
  'Say why, in your own words',
  'A euthanasia with no explanation is refused'
);

-- 6 An injection must say what was given. A captive bolt need not.
select throws_ok(
  $$select public.record_euthanasia(
      p_id => 'ed000000-0000-0000-0000-0000000000e4'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000ea'::uuid,
      p_reason => 'food_safety',
      p_reason_detail => 'Condemned following inspection; unfit for human consumption.',
      p_method => 'injectable'
    )$$,
  '22023',
  'Record what was given',
  'An injectable euthanasia must name the agent'
);

-- 7 Claiming death was confirmed without saying how is the claim without the
-- evidence.
select throws_ok(
  $$select public.record_euthanasia(
      p_id => 'ed000000-0000-0000-0000-0000000000e5'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000ea'::uuid,
      p_reason => 'dangerous',
      p_reason_detail => 'Rabies suspected after biting two people; destroyed on advice.',
      p_method => 'gunshot',
      p_death_confirmed => true
    )$$,
  '22023',
  'Say how death was confirmed',
  'Confirming death requires saying how'
);

-- 8
select throws_ok(
  $$select public.record_euthanasia(
      p_id => 'ed000000-0000-0000-0000-0000000000e6'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000ea'::uuid,
      p_reason => 'because',
      p_reason_detail => 'An unrecognised reason, which should be refused outright.',
      p_method => 'captive_bolt'
    )$$,
  '22023',
  'Invalid reason',
  'An unrecognised reason is refused'
);

-- 9
select throws_ok(
  $$select public.record_euthanasia(
      p_id => 'ed000000-0000-0000-0000-0000000000e7'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000ea'::uuid,
      p_reason => 'suffering',
      p_reason_detail => 'An unrecognised method, which should be refused outright.',
      p_method => 'drowning'
    )$$,
  '22023',
  'Invalid method',
  'An unrecognised method is refused'
);

-- 10 A cull is a group act; a single animal has no count.
select throws_ok(
  $$select public.record_euthanasia(
      p_id => 'ed000000-0000-0000-0000-0000000000e8'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000e9'::uuid,
      p_reason => 'suffering',
      p_reason_detail => 'A count against an individual animal, which should be refused.',
      p_method => 'injectable',
      p_agent => 'Pentobarbital',
      p_animals_count => 12
    )$$,
  '22023',
  'A count belongs to a group folder',
  'A count is refused on an individual animal'
);

-- ---------------------------------------------------------------------------
-- A flock can be culled (11-12)
-- ---------------------------------------------------------------------------

-- 11 Financial is on the list because economic euthanasia is real and common,
-- and a reason that cannot be recorded honestly gets recorded as something
-- else.
select lives_ok(
  $$select public.record_euthanasia(
      p_id => 'ed000000-0000-0000-0000-0000000000f1'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000ea'::uuid,
      p_reason => 'financial',
      p_reason_detail => 'Owner could not meet the cost of treating the whole house; culled on advice.',
      p_method => 'other',
      p_animals_count => 40,
      p_carcass_disposal => 'Buried on farm, away from the water course.'
    )$$,
  'A group cull is one record carrying the count'
);

-- 12 Disposal matters because the question does not end at death.
select is(
  (select carcass_disposal from public.euthanasia_records where id = 'ed000000-0000-0000-0000-0000000000f1'::uuid),
  'Buried on farm, away from the water course.',
  'What became of the carcass is kept'
);

-- ---------------------------------------------------------------------------
-- Consent attaches to it (13-15)
-- ---------------------------------------------------------------------------

-- 13
select lives_ok(
  $$select public.record_consent(
      p_id => 'c0000000-0000-0000-0000-0000000000f1'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000ea'::uuid,
      p_consent_for => 'euthanasia',
      p_euthanasia_record_id => 'ed000000-0000-0000-0000-0000000000f1'::uuid,
      p_granted_by_name => 'Kofi Asare',
      p_granted_by_capacity => 'owner',
      p_method => 'verbal_witnessed',
      p_witness_name => 'Abena Osei',
      p_risks_explained => 'Explained that the decision is final and the birds cannot enter the food chain.'
    )$$,
  'A euthanasia consent is recorded against its record'
);

-- 14 The target is required, exactly as it is for surgery.
select throws_ok(
  $$select public.record_consent(
      p_id => 'c0000000-0000-0000-0000-0000000000f2'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000ea'::uuid,
      p_consent_for => 'euthanasia',
      p_granted_by_name => 'Kofi Asare',
      p_granted_by_capacity => 'owner',
      p_method => 'verbal',
      p_risks_explained => 'Explained that the decision is final and cannot be undone.'
    )$$,
  '22023',
  'A euthanasia consent names the record it is for',
  'A euthanasia consent with no record is refused'
);

-- 15 The immutability trigger had to learn the new column, or a consent could
-- be moved from one death to another after the fact.
reset role;
select throws_ok(
  $$update public.consents
    set euthanasia_record_id = null
    where id = 'c0000000-0000-0000-0000-0000000000f1'::uuid$$,
  '42501',
  'A consent record cannot be altered once given',
  'A euthanasia consent cannot be moved off the death it was given for'
);

-- ---------------------------------------------------------------------------
-- No way in except the function (16)
-- ---------------------------------------------------------------------------

-- 16
select is(
  (select string_agg(privilege_type, ',' order by privilege_type)
   from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name = 'euthanasia_records'
     and grantee = 'authenticated'),
  'SELECT',
  'A signed-in client may read these and nothing else'
);

select * from finish();
rollback;
