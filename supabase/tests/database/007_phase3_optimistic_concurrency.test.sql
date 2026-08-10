begin;

create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('a3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-sync-a@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (
  id, auth_user_id, full_name, phone_display, phone_e164
) values
  ('b3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'Vet Sync A', '0243900001', '+233243900001');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a3000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

select public.create_client(
  'c3000000-0000-0000-0000-000000000001', 'VK-C-SYNC01', 'Sync Client',
  '024 390 0011', '+233243900011'
);
select public.create_patient(
  p_id => 'd3000000-0000-0000-0000-000000000001',
  p_patient_code => 'VK-P-SYNC01',
  p_name => 'Sync Patient',
  p_species => 'dog',
  p_sex => 'female'
);
select public.create_visit(
  'e3000000-0000-0000-0000-000000000001',
  'd3000000-0000-0000-0000-000000000001',
  now(),
  'home_call'
);

-- ---------------------------------------------------------------------------
-- Clients (1-6)
-- ---------------------------------------------------------------------------

-- 1
select is(
  (select server_version from public.clients where id = 'c3000000-0000-0000-0000-000000000001'),
  1::bigint,
  'A newly created client starts at version 1'
);
-- 2
select lives_ok(
  $$select public.update_client(
      'c3000000-0000-0000-0000-000000000001', 'Sync Client Renamed',
      '024 390 0011', '+233243900011', null, null, null, null, null, null, false, null, null, 1
    )$$,
  'An update carrying the version the device read succeeds'
);
-- 3
select is(
  (select server_version from public.clients where id = 'c3000000-0000-0000-0000-000000000001'),
  2::bigint,
  'A successful update advances the version'
);
-- 4
select throws_ok(
  $$select public.update_client(
      'c3000000-0000-0000-0000-000000000001', 'Written From A Stale Device',
      '024 390 0011', '+233243900011', null, null, null, null, null, null, false, null, null, 1
    )$$,
  '40001',
  null,
  'A second device holding the old version is refused'
);
-- 5
select is(
  (select name from public.clients where id = 'c3000000-0000-0000-0000-000000000001'),
  'Sync Client Renamed',
  'The stale write did not land, so the first change survives'
);
-- 6
select lives_ok(
  $$select public.update_client(
      'c3000000-0000-0000-0000-000000000001', 'Written Without A Version',
      '024 390 0011', '+233243900011'
    )$$,
  'Omitting the version keeps the previous overwrite behaviour for online callers'
);

-- ---------------------------------------------------------------------------
-- Patients (7-10)
-- ---------------------------------------------------------------------------

-- 7
select lives_ok(
  $$select public.update_patient(
      p_id => 'd3000000-0000-0000-0000-000000000001',
      p_name => 'Sync Patient',
      p_species => 'dog',
      p_sex => 'female',
      p_base_server_version => 1
    )$$,
  'A patient update carrying the current version succeeds'
);
-- 8
select throws_ok(
  $$select public.update_patient(
      p_id => 'd3000000-0000-0000-0000-000000000001',
      p_name => 'Stale Name',
      p_species => 'dog',
      p_sex => 'female',
      p_base_server_version => 1
    )$$,
  '40001',
  null,
  'A stale patient update is refused'
);
-- 9
select is(
  (select name from public.patients where id = 'd3000000-0000-0000-0000-000000000001'),
  'Sync Patient',
  'The refused patient update left the record untouched'
);
-- 10
select throws_ok(
  $$select public.update_patient(
      p_id => '00000000-0000-0000-0000-0000000000ff',
      p_name => 'Nobody',
      p_species => 'dog',
      p_sex => 'female',
      p_base_server_version => 1
    )$$,
  'P0002',
  'Patient not found',
  'A missing record reports not found rather than a version conflict'
);

-- ---------------------------------------------------------------------------
-- Visit drafts (11-15)
-- ---------------------------------------------------------------------------

-- 11
select lives_ok(
  $$select public.update_visit_draft(
      'e3000000-0000-0000-0000-000000000001', now(), 'home_call',
      'Limping', null, null, null, null, null, null, null, 'kg',
      null, null, null, null, null, null, null, null, null, null, null, 1
    )$$,
  'A consultation saved with the version the device read succeeds'
);
-- 12
select throws_ok(
  $$select public.update_visit_draft(
      'e3000000-0000-0000-0000-000000000001', now(), 'home_call',
      'A different assessment from a second device', null, null, null, null, null, null, null, 'kg',
      null, null, null, null, null, null, null, null, null, null, null, 1
    )$$,
  '40001',
  null,
  'A competing consultation edit is refused rather than silently merged'
);
-- 13
select is(
  (select chief_complaint from public.visits where id = 'e3000000-0000-0000-0000-000000000001'),
  'Limping',
  'The clinical note the first device wrote is still there'
);
-- 14
select lives_ok(
  $$select public.update_visit_draft(
      'e3000000-0000-0000-0000-000000000001', now(), 'home_call', 'Limping badly'
    )$$,
  'A caller that passes no version still saves, as the web app does'
);
-- 15
select is(
  (select server_version from public.visits where id = 'e3000000-0000-0000-0000-000000000001'),
  3::bigint,
  'Each accepted consultation save advances the version'
);

-- ---------------------------------------------------------------------------
-- Examination findings (16-19)
-- ---------------------------------------------------------------------------

-- 16
select is(
  (select count(*)::integer from public.physical_exam_findings
    where visit_id = 'e3000000-0000-0000-0000-000000000001'),
  11,
  'The eleven systems exist to be edited'
);
-- 17
select lives_ok(
  $$select public.set_exam_finding(
      'e3000000-0000-0000-0000-000000000001', 'Cardiovascular', 'normal', null, null, 1
    )$$,
  'An examination finding saved with the current version succeeds'
);
-- 18
select throws_ok(
  $$select public.set_exam_finding(
      'e3000000-0000-0000-0000-000000000001', 'Cardiovascular', 'abnormal', 'Murmur', null, 1
    )$$,
  '40001',
  null,
  'A competing edit to the same system is refused'
);
-- 19
select is(
  (select status from public.physical_exam_findings
    where visit_id = 'e3000000-0000-0000-0000-000000000001' and system_name = 'Cardiovascular'),
  'normal',
  'The refused examination edit did not overwrite the first finding'
);

-- ---------------------------------------------------------------------------
-- A conflict on one system does not block a different one (20)
-- ---------------------------------------------------------------------------

-- 20
select lives_ok(
  $$select public.set_exam_finding(
      'e3000000-0000-0000-0000-000000000001', 'Respiratory', 'abnormal', 'Crackles', null, 1
    )$$,
  'A different system is still editable, so a conflict is scoped to one system'
);

reset role;

select * from finish();
rollback;
