begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('a9000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-code-a@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a9000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-code-b@example.test', crypt('Strong-Test-Password-2!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (id, auth_user_id, full_name, phone_display, phone_e164) values
  ('b9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000001', 'Vet Code A', '0243990001', '+233243990001'),
  ('b9000000-0000-0000-0000-000000000002', 'a9000000-0000-0000-0000-000000000002', 'Vet Code B', '0243990002', '+233243990002');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a9000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

select public.create_client(
  'c9000000-0000-0000-0000-000000000001', 'VK-C-RCD001', 'Code Client',
  '024 399 0011', '+233243990011'
);

select public.create_patient(
  p_id => 'd9000000-0000-0000-0000-000000000001',
  p_patient_code => 'VK-P-RCD001', p_name => 'Bella',
  p_species => 'dog', p_sex => 'female'
);

-- ---------------------------------------------------------------------------
-- A device-minted code is kept (1-2)
-- ---------------------------------------------------------------------------

select public.create_visit(
  p_id => 'e9000000-0000-0000-0000-000000000001',
  p_patient_id => 'd9000000-0000-0000-0000-000000000001',
  p_visit_date => now(),
  p_visit_type => 'home_call',
  p_record_code => 'VK-R-ABC123'
);

-- 1
select is(
  (select record_code from public.visits where id = 'e9000000-0000-0000-0000-000000000001'),
  'VK-R-ABC123',
  'The code the device minted is the code the record carries'
);

-- 2 Lower case arrives when a code is typed rather than generated.
select public.create_visit(
  p_id => 'e9000000-0000-0000-0000-000000000002',
  p_patient_id => 'd9000000-0000-0000-0000-000000000001',
  p_visit_date => now(),
  p_visit_type => 'follow_up',
  p_record_code => '  vk-r-def456  '
);

select is(
  (select record_code from public.visits where id = 'e9000000-0000-0000-0000-000000000002'),
  'VK-R-DEF456',
  'A typed code is trimmed and upper-cased rather than rejected'
);

-- ---------------------------------------------------------------------------
-- An older client still writes records (3-4)
-- ---------------------------------------------------------------------------

-- 3 A build that predates the parameter must not lose the ability to record a
-- consultation. The server mints one instead of refusing.
select public.create_visit(
  p_id => 'e9000000-0000-0000-0000-000000000003',
  p_patient_id => 'd9000000-0000-0000-0000-000000000001',
  p_visit_date => now(),
  p_visit_type => 'clinic_visit'
);

select matches(
  (select record_code from public.visits where id = 'e9000000-0000-0000-0000-000000000003'),
  '^VK-R-[0-9A-HJKMNP-TV-Z]{6}$',
  'A client that sends no code still gets a valid one from the server'
);

-- 4
select isnt(
  (select record_code from public.visits where id = 'e9000000-0000-0000-0000-000000000003'),
  (select record_code from public.visits where id = 'e9000000-0000-0000-0000-000000000001'),
  'A server-minted code does not collide with one already in use'
);

-- ---------------------------------------------------------------------------
-- The format is enforced (5-7)
-- ---------------------------------------------------------------------------

-- 5
select throws_ok(
  $$select public.create_visit(
      p_id => 'e9000000-0000-0000-0000-000000000004',
      p_patient_id => 'd9000000-0000-0000-0000-000000000001',
      p_visit_date => now(), p_visit_type => 'home_call',
      p_record_code => 'VK-R-TOOLONG'
    )$$,
  '22023',
  'Invalid record code format',
  'A malformed code is refused'
);

-- 6 I, L, O and U are excluded because a code is read aloud down a telephone.
select throws_ok(
  $$select public.create_visit(
      p_id => 'e9000000-0000-0000-0000-000000000005',
      p_patient_id => 'd9000000-0000-0000-0000-000000000001',
      p_visit_date => now(), p_visit_type => 'home_call',
      p_record_code => 'VK-R-ABCIOU'
    )$$,
  '22023',
  'Invalid record code format',
  'The letters that are misread aloud are not in the alphabet'
);

-- 7 The wrong series is not merely the wrong prefix; it is a different thing.
select throws_ok(
  $$select public.create_visit(
      p_id => 'e9000000-0000-0000-0000-000000000006',
      p_patient_id => 'd9000000-0000-0000-0000-000000000001',
      p_visit_date => now(), p_visit_type => 'home_call',
      p_record_code => 'VK-P-ABC123'
    )$$,
  '22023',
  'Invalid record code format',
  'A patient code is not accepted as a record code'
);

-- ---------------------------------------------------------------------------
-- The code never changes (8-9)
-- ---------------------------------------------------------------------------

-- 8 It is printed on a document that has left the building.
--
-- Run as the owner rather than as authenticated. authenticated holds no UPDATE
-- on visits at all, so as that role the grant refuses first and the trigger is
-- never reached — which would make this test pass while proving nothing about
-- the trigger. The grant is the outer defence; this asserts the inner one, which
-- is what a SECURITY DEFINER function would meet.
reset role;

select throws_ok(
  $$update public.visits set record_code = 'VK-R-ZZZ999'
    where id = 'e9000000-0000-0000-0000-000000000001'$$,
  '42501',
  'The reference of a record cannot change',
  'A record cannot be renumbered while a client holds the old reference'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a9000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

-- 9 Signing must not disturb it.
select public.complete_visit('e9000000-0000-0000-0000-000000000001');

select is(
  (select record_code from public.visits where id = 'e9000000-0000-0000-0000-000000000001'),
  'VK-R-ABC123',
  'Signing the record leaves its reference alone'
);

-- ---------------------------------------------------------------------------
-- A replayed sync keeps the original (10)
-- ---------------------------------------------------------------------------

-- 10 The code already went to the client; a retry must not mint a second one.
select public.create_visit(
  p_id => 'e9000000-0000-0000-0000-000000000002',
  p_patient_id => 'd9000000-0000-0000-0000-000000000001',
  p_visit_date => now(),
  p_visit_type => 'follow_up',
  p_record_code => 'VK-R-999999'
);

select is(
  (select record_code from public.visits where id = 'e9000000-0000-0000-0000-000000000002'),
  'VK-R-DEF456',
  'A replayed sync keeps the code the client was already given'
);

-- ---------------------------------------------------------------------------
-- Uniqueness is per veterinarian (11-12)
-- ---------------------------------------------------------------------------

-- 11
select throws_ok(
  $$select public.create_visit(
      p_id => 'e9000000-0000-0000-0000-000000000007',
      p_patient_id => 'd9000000-0000-0000-0000-000000000001',
      p_visit_date => now(), p_visit_type => 'home_call',
      p_record_code => 'VK-R-ABC123'
    )$$,
  '23505',
  null,
  'One veterinarian cannot issue the same reference twice'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"a9000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}', true);

select public.create_client(
  'c9000000-0000-0000-0000-000000000002', 'VK-C-RCD002', 'Other Client',
  '024 399 0022', '+233243990022'
);
select public.create_patient(
  p_id => 'd9000000-0000-0000-0000-000000000002',
  p_patient_code => 'VK-P-RCD002', p_name => 'Rex',
  p_species => 'dog', p_sex => 'male'
);

-- 12 Codes are tenant-facing; two practices never read each other's documents,
-- so the same string in both is not a conflict.
select lives_ok(
  $$select public.create_visit(
      p_id => 'e9000000-0000-0000-0000-000000000008',
      p_patient_id => 'd9000000-0000-0000-0000-000000000002',
      p_visit_date => now(), p_visit_type => 'home_call',
      p_record_code => 'VK-R-ABC123'
    )$$,
  'A different veterinarian may hold the same reference'
);

reset role;

select * from finish();
rollback;
