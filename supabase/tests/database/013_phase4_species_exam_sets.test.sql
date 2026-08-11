begin;

create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('a7000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-exam-a@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (id, auth_user_id, full_name, phone_display, phone_e164) values
  ('b7000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000001', 'Vet Exam A', '0243970001', '+233243970001');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a7000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

select public.create_client(
  'c7000000-0000-0000-0000-000000000001', 'VK-C-EXM001', 'Exam Client',
  '024 397 0011', '+233243970011'
);

select public.create_patient(
  p_id => 'd7000000-0000-0000-0000-000000000001',
  p_patient_code => 'VK-P-EXM001', p_name => 'Bruno',
  p_species => 'dog', p_sex => 'male'
);
select public.create_patient(
  p_id => 'd7000000-0000-0000-0000-000000000002',
  p_patient_code => 'VK-P-EXM002', p_name => 'Kiki',
  p_species => 'bird', p_sex => 'unknown'
);
select public.create_patient(
  p_id => 'd7000000-0000-0000-0000-000000000003',
  p_patient_code => 'VK-P-EXM003', p_name => 'Thumper',
  p_species => 'rabbit', p_sex => 'male'
);
select public.create_patient(
  p_id => 'd7000000-0000-0000-0000-000000000004',
  p_patient_code => 'VK-P-EXM004', p_name => 'Layer house 2',
  p_species => 'poultry', p_kind => 'group', p_purpose => 'eggs', p_head_count => 400
);

select public.create_visit('e7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', now(), 'home_call');
select public.create_visit('e7000000-0000-0000-0000-000000000002', 'd7000000-0000-0000-0000-000000000002', now(), 'home_call');
select public.create_visit('e7000000-0000-0000-0000-000000000003', 'd7000000-0000-0000-0000-000000000003', now(), 'home_call');
select public.create_visit('e7000000-0000-0000-0000-000000000004', 'd7000000-0000-0000-0000-000000000004', now(), 'field_visit');

-- ---------------------------------------------------------------------------
-- A dog keeps the eleven it always had (1-2)
-- ---------------------------------------------------------------------------

-- 1
select is(
  (select count(*)::int from public.physical_exam_findings where visit_id = 'e7000000-0000-0000-0000-000000000001'),
  11,
  'A dog is still seeded with the eleven mammalian systems'
);

-- 2
select ok(
  not exists (
    select 1 from public.physical_exam_findings
    where visit_id = 'e7000000-0000-0000-0000-000000000001' and system_name in ('Crop', 'Keel', 'Vent')
  ),
  'A dog is not asked about a crop'
);

-- ---------------------------------------------------------------------------
-- A bird is asked what a bird has (3-6)
-- ---------------------------------------------------------------------------

-- 3
select ok(
  exists (select 1 from public.physical_exam_findings where visit_id = 'e7000000-0000-0000-0000-000000000002' and system_name = 'Crop'),
  'A bird is asked about its crop'
);

-- 4
select ok(
  exists (select 1 from public.physical_exam_findings where visit_id = 'e7000000-0000-0000-0000-000000000002' and system_name = 'Keel')
  and exists (select 1 from public.physical_exam_findings where visit_id = 'e7000000-0000-0000-0000-000000000002' and system_name = 'Vent')
  and exists (select 1 from public.physical_exam_findings where visit_id = 'e7000000-0000-0000-0000-000000000002' and system_name = 'Beak and cere'),
  'A bird is asked about its keel, vent, beak and cere'
);

-- 5
select ok(
  not exists (
    select 1 from public.physical_exam_findings
    where visit_id = 'e7000000-0000-0000-0000-000000000002'
      and system_name in ('Lymphatic', 'Aural', 'Gastrointestinal')
  ),
  'A bird is not asked about systems it does not present with'
);

-- 6
select is(
  (select status from public.physical_exam_findings
   where visit_id = 'e7000000-0000-0000-0000-000000000002' and system_name = 'Crop'),
  'not_examined',
  'Every system starts unexamined, so normal is always a deliberate act'
);

-- ---------------------------------------------------------------------------
-- A rabbit gains its teeth (7-8)
-- ---------------------------------------------------------------------------

-- 7
select ok(
  exists (select 1 from public.physical_exam_findings where visit_id = 'e7000000-0000-0000-0000-000000000003' and system_name = 'Dental'),
  'A rabbit is asked about its teeth, which is why most are presented'
);

-- 8
select ok(
  not exists (select 1 from public.physical_exam_findings where visit_id = 'e7000000-0000-0000-0000-000000000001' and system_name = 'Dental'),
  'A dog is not, since the mammalian set never carried it'
);

-- ---------------------------------------------------------------------------
-- A flock is not examined system by system (9)
-- ---------------------------------------------------------------------------

-- 9
select is(
  (select count(*)::int from public.physical_exam_findings where visit_id = 'e7000000-0000-0000-0000-000000000004'),
  0,
  'A flock is assessed by counts and post-mortem, not by palpating four hundred birds'
);

-- ---------------------------------------------------------------------------
-- Recording follows the same set (10-13)
-- ---------------------------------------------------------------------------

-- 10
select lives_ok(
  $$select public.set_exam_finding(
      'e7000000-0000-0000-0000-000000000002', 'Crop', 'abnormal', 'Crop stasis'
    )$$,
  'A crop finding can be recorded on a bird'
);

-- 11
select throws_ok(
  $$select public.set_exam_finding(
      'e7000000-0000-0000-0000-000000000001', 'Crop', 'normal'
    )$$,
  '22023',
  'Invalid examination system',
  'A crop finding is refused on a dog'
);

-- 12
select throws_ok(
  $$select public.set_exam_finding(
      'e7000000-0000-0000-0000-000000000002', 'Lymphatic', 'normal'
    )$$,
  '22023',
  'Invalid examination system',
  'A system outside the bird set is refused even though it exists for mammals'
);

-- 13
select is(
  (select remarks from public.physical_exam_findings
   where visit_id = 'e7000000-0000-0000-0000-000000000002' and system_name = 'Crop'),
  'Crop stasis',
  'The finding is stored against the right system'
);

reset role;

select * from finish();
rollback;
