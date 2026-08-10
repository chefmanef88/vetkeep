begin;

create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('a4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-folder-a@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (
  id, auth_user_id, full_name, phone_display, phone_e164
) values
  ('b4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'Vet Folder A', '0243940001', '+233243940001');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a4000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

select public.create_client(
  'c4000000-0000-0000-0000-000000000001', 'VK-C-FDR001', 'Folder Client',
  '024 394 0011', '+233243940011'
);

-- ---------------------------------------------------------------------------
-- Individual folders (1-6)
-- ---------------------------------------------------------------------------

-- 1
select lives_ok(
  $$select public.create_patient(
      p_id => 'd4000000-0000-0000-0000-000000000001',
      p_patient_code => 'VK-P-FDR001',
      p_name => 'Cynthia',
      p_species => 'dog',
      p_sex => 'female'
    )$$,
  'An individual folder can be created without stating kind or purpose'
);

-- 2
select is(
  (select kind from public.patients where id = 'd4000000-0000-0000-0000-000000000001'),
  'individual',
  'kind defaults to individual'
);

-- 3
select is(
  (select purpose from public.patients where id = 'd4000000-0000-0000-0000-000000000001'),
  'pet',
  'purpose defaults to pet'
);

-- 4
select throws_ok(
  $$select public.create_patient(
      p_id => gen_random_uuid(),
      p_patient_code => 'VK-P-FDR002',
      p_name => 'No Sex',
      p_species => 'dog'
    )$$,
  '22023',
  'Invalid sex value',
  'An individual animal must state a sex'
);

-- 5
select throws_ok(
  $$select public.create_patient(
      p_id => gen_random_uuid(),
      p_patient_code => 'VK-P-FDR003',
      p_name => 'Counted Dog',
      p_species => 'dog',
      p_sex => 'male',
      p_head_count => 12
    )$$,
  '22023',
  'An individual animal cannot carry a head count',
  'An individual animal cannot carry a head count'
);

-- 6
select throws_ok(
  $$select public.create_patient(
      p_id => gen_random_uuid(),
      p_patient_code => 'VK-P-FDR004',
      p_name => 'Unknown Beast',
      p_species => 'dragon',
      p_sex => 'male'
    )$$,
  '22023',
  'Invalid species',
  'Species is drawn from the controlled list'
);

-- ---------------------------------------------------------------------------
-- Group folders (7-12)
-- ---------------------------------------------------------------------------

-- 7
select lives_ok(
  $$select public.create_patient(
      p_id => 'd4000000-0000-0000-0000-000000000002',
      p_patient_code => 'VK-P-FDR005',
      p_name => 'Layer house 2',
      p_species => 'poultry',
      p_kind => 'group',
      p_purpose => 'eggs',
      p_head_count => 400,
      p_group_age_weeks => 32,
      p_housing => 'Deep litter, open sided'
    )$$,
  'A flock can be recorded as a group folder'
);

-- 8
select is(
  (select head_count from public.patients where id = 'd4000000-0000-0000-0000-000000000002'),
  400,
  'The head count is stored, so "12 of 400 affected" has a denominator'
);

-- 9
select is(
  (select sex from public.patients where id = 'd4000000-0000-0000-0000-000000000002'),
  null,
  'A group carries no single sex'
);

-- 10
select throws_ok(
  $$select public.create_patient(
      p_id => gen_random_uuid(),
      p_patient_code => 'VK-P-FDR006',
      p_name => 'Uncounted flock',
      p_species => 'poultry',
      p_kind => 'group',
      p_purpose => 'meat'
    )$$,
  '22023',
  'A group needs a head count',
  'A group must state how many animals it contains'
);

-- 11
select throws_ok(
  $$select public.create_patient(
      p_id => gen_random_uuid(),
      p_patient_code => 'VK-P-FDR007',
      p_name => 'Sexed flock',
      p_species => 'goat',
      p_kind => 'group',
      p_purpose => 'meat',
      p_sex => 'female',
      p_head_count => 30
    )$$,
  '22023',
  'A group does not carry a single sex',
  'A group cannot be given one sex'
);

-- 12
select throws_ok(
  $$select public.create_patient(
      p_id => gen_random_uuid(),
      p_patient_code => 'VK-P-FDR008',
      p_name => 'Bad purpose',
      p_species => 'cattle',
      p_sex => 'female',
      p_purpose => 'racing'
    )$$,
  '22023',
  'Invalid purpose',
  'Purpose is drawn from the controlled list'
);

-- ---------------------------------------------------------------------------
-- Purpose is independent of species (13-15)
-- ---------------------------------------------------------------------------

-- 13
select lives_ok(
  $$select public.create_patient(
      p_id => 'd4000000-0000-0000-0000-000000000003',
      p_patient_code => 'VK-P-FDR009',
      p_name => 'Thumper',
      p_species => 'rabbit',
      p_sex => 'male',
      p_purpose => 'pet'
    )$$,
  'A rabbit can be kept as a pet'
);

-- 14
select lives_ok(
  $$select public.create_patient(
      p_id => 'd4000000-0000-0000-0000-000000000004',
      p_patient_code => 'VK-P-FDR010',
      p_name => 'Meat colony',
      p_species => 'rabbit',
      p_kind => 'group',
      p_purpose => 'meat',
      p_head_count => 25
    )$$,
  'The same species can be kept for meat'
);

-- 15
select isnt(
  (select purpose from public.patients where id = 'd4000000-0000-0000-0000-000000000003'),
  (select purpose from public.patients where id = 'd4000000-0000-0000-0000-000000000004'),
  'Two rabbits carry different obligations, which is why purpose is not derived from species'
);

-- ---------------------------------------------------------------------------
-- Identifiers (16-18)
-- ---------------------------------------------------------------------------

-- 16
select lives_ok(
  $$select public.create_patient(
      p_id => 'd4000000-0000-0000-0000-000000000005',
      p_patient_code => 'VK-P-FDR011',
      p_name => 'Tagged cow',
      p_species => 'cattle',
      p_sex => 'female',
      p_purpose => 'milk',
      p_ear_tag => 'GH-4471'
    )$$,
  'A food animal can be identified by ear tag'
);

-- 17
select is(
  (select ear_tag from public.patients where id = 'd4000000-0000-0000-0000-000000000005'),
  'GH-4471',
  'The ear tag is stored and searchable'
);

-- 18
select lives_ok(
  $$select public.create_patient(
      p_id => 'd4000000-0000-0000-0000-000000000006',
      p_patient_code => 'VK-P-FDR012',
      p_name => 'Kiki',
      p_species => 'bird',
      p_sex => 'unknown',
      p_leg_ring => 'AX-2291'
    )$$,
  'A bird can be identified by leg ring'
);

-- ---------------------------------------------------------------------------
-- update_patient (19-22)
-- ---------------------------------------------------------------------------

-- 19
select lives_ok(
  $$select public.update_patient(
      p_id => 'd4000000-0000-0000-0000-000000000002',
      p_name => 'Layer house 2',
      p_species => 'poultry',
      p_kind => 'group',
      p_purpose => 'eggs',
      p_head_count => 380,
      p_base_server_version => 1
    )$$,
  'A flock size can be corrected as birds are lost'
);

-- 20
select is(
  (select head_count from public.patients where id = 'd4000000-0000-0000-0000-000000000002'),
  380,
  'The corrected head count is stored'
);

-- 21
select throws_ok(
  $$select public.update_patient(
      p_id => 'd4000000-0000-0000-0000-000000000002',
      p_name => 'Layer house 2',
      p_species => 'poultry',
      p_kind => 'group',
      p_purpose => 'eggs',
      p_base_server_version => 2
    )$$,
  '22023',
  'A group needs a head count',
  'A group cannot be updated into having no head count'
);

-- 22
select throws_ok(
  $$select public.update_patient(
      p_id => 'd4000000-0000-0000-0000-000000000002',
      p_name => 'Stale flock',
      p_species => 'poultry',
      p_kind => 'group',
      p_purpose => 'eggs',
      p_head_count => 300,
      p_base_server_version => 1
    )$$,
  '40001',
  null,
  'A stale update to a folder is still rejected'
);

reset role;

select * from finish();
rollback;
