begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('aa000000-0000-0000-0000-0000000000e1'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-surg-a@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('aa000000-0000-0000-0000-0000000000e2'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-surg-b@example.test', crypt('Strong-Test-Password-2!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (id, auth_user_id, full_name, phone_display, phone_e164) values
  ('ba000000-0000-0000-0000-0000000000e1'::uuid, 'aa000000-0000-0000-0000-0000000000e1'::uuid, 'Vet Surgery A', '0243910061', '+233243910061'),
  ('ba000000-0000-0000-0000-0000000000e2'::uuid, 'aa000000-0000-0000-0000-0000000000e2'::uuid, 'Vet Surgery B', '0243910062', '+233243910062');

insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
  ('5e000000-0000-0000-0000-0000000000e1'::uuid, 'aa000000-0000-0000-0000-0000000000e1'::uuid, now(), now(), 'aal2'),
  ('5e000000-0000-0000-0000-0000000000e2'::uuid, 'aa000000-0000-0000-0000-0000000000e2'::uuid, now(), now(), 'aal2');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa000000-0000-0000-0000-0000000000e1', true);
select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-0000000000e1","role":"authenticated","aal":"aal2","session_id":"5e000000-0000-0000-0000-0000000000e1"}', true);

select public.create_client(
  'ca000000-0000-0000-0000-0000000000e1'::uuid, 'VK-C-SG0001', 'Surgery Owner',
  '024 391 0063', '+233243910063'
);

-- A dog and a herd, so the same call can be made against each and the count
-- rule can be tested in both directions.
select public.create_patient(
  p_id => 'da000000-0000-0000-0000-0000000000e1'::uuid,
  p_patient_code => 'VK-P-SG0001', p_name => 'Nala',
  p_species => 'dog', p_sex => 'female'
);
select public.create_patient(
  p_id => 'da000000-0000-0000-0000-0000000000e2'::uuid,
  p_patient_code => 'VK-P-SG0002', p_name => 'Weaner pen 2',
  p_species => 'cattle', p_kind => 'group', p_purpose => 'meat',
  p_head_count => 40
);

select public.create_visit(
  p_id => 'ea000000-0000-0000-0000-0000000000e1'::uuid,
  p_patient_id => 'da000000-0000-0000-0000-0000000000e1'::uuid,
  p_visit_date => now(), p_visit_type => 'clinic_visit'
);
select public.create_visit(
  p_id => 'ea000000-0000-0000-0000-0000000000e2'::uuid,
  p_patient_id => 'da000000-0000-0000-0000-0000000000e2'::uuid,
  p_visit_date => now(), p_visit_type => 'field_visit'
);

-- ---------------------------------------------------------------------------
-- Recording one (1-4)
-- ---------------------------------------------------------------------------

-- 1 The routine case this exists for: a planned spay under a general.
select lives_ok(
  $$select public.record_surgical_procedure(
      p_id => 'fa000000-0000-0000-0000-0000000000e1'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000e1'::uuid,
      p_procedure_name => 'Ovariohysterectomy',
      p_procedure_kind => 'routine',
      p_anaesthesia => 'general',
      p_induction_agent => 'Propofol 4 mg/kg IV',
      p_maintenance_agent => 'Isoflurane in oxygen',
      p_analgesia => 'Meloxicam 0.2 mg/kg SC',
      p_pre_op_assessment => 'Bright, hydrated, fasted 10 hours.',
      p_post_op_instructions => 'Lead walks only for ten days. Remove sutures day 10.'
    )$$,
  'A routine spay under a general anaesthetic is recorded'
);

-- 2
select is(
  (select anaesthesia from public.surgical_procedures where id = 'fa000000-0000-0000-0000-0000000000e1'::uuid),
  'general',
  'The anaesthetic protocol is stored with the procedure'
);

-- 3 A dehorning session is one afternoon across the pen, not forty operations.
select lives_ok(
  $$select public.record_surgical_procedure(
      p_id => 'fa000000-0000-0000-0000-0000000000e2'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000e2'::uuid,
      p_procedure_name => 'Disbudding',
      p_procedure_kind => 'routine',
      p_anaesthesia => 'local',
      p_animals_treated => 18,
      p_analgesia => 'Cornual nerve block, lidocaine'
    )$$,
  'A group procedure is one row carrying the number treated'
);

-- 4 A replayed sync is not an error.
select lives_ok(
  $$select public.record_surgical_procedure(
      p_id => 'fa000000-0000-0000-0000-0000000000e2'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000e2'::uuid,
      p_procedure_name => 'Disbudding',
      p_procedure_kind => 'routine',
      p_anaesthesia => 'local',
      p_animals_treated => 18
    )$$,
  'Sending the same procedure twice is not an error'
);

-- ---------------------------------------------------------------------------
-- What is refused (5-10)
-- ---------------------------------------------------------------------------

-- 5 The guard that matters most clinically. An incomplete record of a general
-- anaesthetic is not a valid one.
select throws_ok(
  $$select public.record_surgical_procedure(
      p_id => 'fa000000-0000-0000-0000-0000000000e3'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000e1'::uuid,
      p_procedure_name => 'Enterotomy',
      p_procedure_kind => 'emergency',
      p_anaesthesia => 'general'
    )$$,
  '22023',
  'A general anaesthetic needs its induction agent recorded',
  'A general anaesthetic without an induction agent is refused'
);

-- 6 "3 of 1" is not a thing a folder should be able to say.
select throws_ok(
  $$select public.record_surgical_procedure(
      p_id => 'fa000000-0000-0000-0000-0000000000e4'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000e1'::uuid,
      p_procedure_name => 'Castration',
      p_procedure_kind => 'routine',
      p_anaesthesia => 'sedation',
      p_animals_treated => 4
    )$$,
  '22023',
  'A count belongs to a group folder',
  'A number treated is refused on an individual animal'
);

-- 7
select throws_ok(
  $$select public.record_surgical_procedure(
      p_id => 'fa000000-0000-0000-0000-0000000000e5'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000e1'::uuid,
      p_procedure_name => 'Castration',
      p_procedure_kind => 'elective',
      p_anaesthesia => 'sedation'
    )$$,
  '22023',
  'Invalid procedure kind',
  'An unknown procedure kind is refused'
);

-- 8
select throws_ok(
  $$select public.record_surgical_procedure(
      p_id => 'fa000000-0000-0000-0000-0000000000e6'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000e1'::uuid,
      p_procedure_name => 'Castration',
      p_procedure_kind => 'routine',
      p_anaesthesia => 'epidural'
    )$$,
  '22023',
  'Invalid anaesthesia type',
  'An unknown anaesthetic type is refused'
);

-- 9
select throws_ok(
  $$select public.record_surgical_procedure(
      p_id => 'fa000000-0000-0000-0000-0000000000e7'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000e1'::uuid,
      p_procedure_name => 'Castration',
      p_procedure_kind => 'routine',
      p_anaesthesia => 'sedation',
      p_outcome => 'fine'
    )$$,
  '22023',
  'Invalid outcome',
  'An unknown outcome is refused'
);

-- 10 Another practice's consultation is not somewhere to file a procedure.
select set_config('request.jwt.claim.sub', 'aa000000-0000-0000-0000-0000000000e2', true);
select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-0000000000e2","role":"authenticated","aal":"aal2","session_id":"5e000000-0000-0000-0000-0000000000e2"}', true);

select throws_ok(
  $$select public.record_surgical_procedure(
      p_id => 'fa000000-0000-0000-0000-0000000000e8'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000e1'::uuid,
      p_procedure_name => 'Castration',
      p_procedure_kind => 'routine',
      p_anaesthesia => 'sedation'
    )$$,
  'P0002',
  'Consultation not found',
  'Another practice cannot record against this consultation'
);

-- 11 And cannot read what was recorded in it.
select is(
  (select count(*)::int from public.surgical_procedures),
  0,
  'Another practice sees none of these procedures'
);

select set_config('request.jwt.claim.sub', 'aa000000-0000-0000-0000-0000000000e1', true);
select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-0000000000e1","role":"authenticated","aal":"aal2","session_id":"5e000000-0000-0000-0000-0000000000e1"}', true);

-- ---------------------------------------------------------------------------
-- An anaesthetic death is a fact, not a sentence in prose (12)
-- ---------------------------------------------------------------------------

-- 12
select lives_ok(
  $$select public.record_surgical_procedure(
      p_id => 'fa000000-0000-0000-0000-0000000000e9'::uuid,
      p_visit_id => 'ea000000-0000-0000-0000-0000000000e1'::uuid,
      p_procedure_name => 'Caesarean section',
      p_procedure_kind => 'emergency',
      p_anaesthesia => 'general',
      p_induction_agent => 'Ketamine 5 mg/kg IV',
      p_outcome => 'died',
      p_complications => 'Arrested during closure. Resuscitation unsuccessful.'
    )$$,
  'An anaesthetic death is recordable as an outcome'
);

-- ---------------------------------------------------------------------------
-- Correcting one, and the point it stops (13-15)
-- ---------------------------------------------------------------------------

-- 13
select lives_ok(
  $$select public.update_surgical_procedure(
      p_id => 'fa000000-0000-0000-0000-0000000000e1'::uuid,
      p_procedure_name => 'Ovariohysterectomy',
      p_procedure_kind => 'routine',
      p_anaesthesia => 'general',
      p_induction_agent => 'Alfaxalone 2 mg/kg IV',
      p_base_server_version => 1
    )$$,
  'A procedure can be corrected while its consultation is a draft'
);

-- 14
select is(
  (select induction_agent from public.surgical_procedures where id = 'fa000000-0000-0000-0000-0000000000e1'::uuid),
  'Alfaxalone 2 mg/kg IV',
  'The correction is what the record now holds'
);

-- 15 Signing closes it, as it closes everything else on the consultation.
select public.complete_visit(p_visit_id => 'ea000000-0000-0000-0000-0000000000e1'::uuid);

select throws_ok(
  $$select public.update_surgical_procedure(
      p_id => 'fa000000-0000-0000-0000-0000000000e1'::uuid,
      p_procedure_name => 'Ovariohysterectomy',
      p_procedure_kind => 'routine',
      p_anaesthesia => 'general',
      p_induction_agent => 'Something else entirely',
      p_base_server_version => 2
    )$$,
  '42501',
  'This record is signed and cannot be edited',
  'A signed consultation freezes the procedures beneath it'
);

-- ---------------------------------------------------------------------------
-- No way in except the function (16)
-- ---------------------------------------------------------------------------

-- 16 The grant, not the policy. A default ACL on this database hands new tables
-- more than SELECT, and RLS does not apply to TRUNCATE — so a table that skips
-- the explicit revoke is one a signed-in client can empty.
select is(
  (select string_agg(privilege_type, ',' order by privilege_type)
   from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name = 'surgical_procedures'
     and grantee = 'authenticated'),
  'SELECT',
  'A signed-in client may read these and nothing else'
);

select * from finish();
rollback;
