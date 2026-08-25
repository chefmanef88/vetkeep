begin;

create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('ac000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-pass-a@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('ac000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-pass-b@example.test', crypt('Strong-Test-Password-2!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (id, auth_user_id, full_name, business_name, phone_display, phone_e164, license_verified) values
  ('bc000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000001', 'Ama Mensah', 'Mensah Mobile Vet', '0243930001', '+233243930001', true),
  ('bc000000-0000-0000-0000-000000000002', 'ac000000-0000-0000-0000-000000000002', 'Vet Pass B', 'Other Practice', '0243930002', '+233243930002', false);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ac000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"ac000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

select public.create_client(
  'cc000000-0000-0000-0000-000000000001', 'VK-C-PSS001', 'Kwame Boateng',
  '024 393 0011', '+233243930011'
);
select public.create_patient(
  p_id => 'dc000000-0000-0000-0000-000000000001',
  p_patient_code => 'VK-P-PSS001', p_name => 'Simba',
  p_species => 'dog', p_sex => 'male',
  p_breed => 'Boerboel', p_color_markings => 'Brindle, white chest',
  p_microchip_id => '900123456789012'
);
select public.create_patient_owner(
  '0c000000-0000-0000-0000-000000000001',
  'dc000000-0000-0000-0000-000000000001',
  'cc000000-0000-0000-0000-000000000001'
);

-- A signed record the vet chooses to publish, and a draft they never could.
select public.create_visit(
  p_id => 'ec000000-0000-0000-0000-000000000001',
  p_patient_id => 'dc000000-0000-0000-0000-000000000001',
  p_visit_date => now() - interval '2 days', p_visit_type => 'home_call',
  p_chief_complaint => 'Annual check'
);
select public.update_visit_draft(
  p_id => 'ec000000-0000-0000-0000-000000000001',
  p_visit_date => now() - interval '2 days', p_visit_type => 'home_call',
  p_chief_complaint => 'Annual check',
  p_definitive_diagnosis => 'Healthy',
  p_prescriptions => 'SECRET PRESCRIPTION TEXT',
  p_treatment_plan => 'SECRET TREATMENT PLAN'
);
select public.complete_visit('ec000000-0000-0000-0000-000000000001');

select public.create_visit(
  p_id => 'ec000000-0000-0000-0000-000000000002',
  p_patient_id => 'dc000000-0000-0000-0000-000000000001',
  p_visit_date => now(), p_visit_type => 'follow_up',
  p_chief_complaint => 'DRAFT COMPLAINT'
);

select public.record_preventive_care(
  p_id => '2c000000-0000-0000-0000-000000000001',
  p_patient_id => 'dc000000-0000-0000-0000-000000000001',
  p_kind => 'vaccination',
  p_product_name => 'Nobivac Rabies',
  p_vaccine_type => 'anti_rabies',
  p_date_given => (now() - interval '30 days')::date,
  p_next_due_date => (now() + interval '335 days')::date
);

-- ---------------------------------------------------------------------------
-- Consent gates publication (1-3)
-- ---------------------------------------------------------------------------

-- 1 Publishing an animal's details is the owner's decision.
select throws_ok(
  $$select public.enable_patient_passport(
      'fc000000-0000-0000-0000-000000000001',
      'dc000000-0000-0000-0000-000000000001',
      'aaaaaaaabbbbbbbbccccccccdddddddd',
      false
    )$$,
  '22023',
  'The owner must consent before a passport is published',
  'A passport cannot be enabled without consent'
);

-- 2 A guessable token is not a token.
select throws_ok(
  $$select public.enable_patient_passport(
      'fc000000-0000-0000-0000-000000000001',
      'dc000000-0000-0000-0000-000000000001',
      'short', true
    )$$,
  '22023',
  'Invalid passport token',
  'A low-entropy token is refused'
);

-- 3
select lives_ok(
  $$select public.enable_patient_passport(
      p_id => 'fc000000-0000-0000-0000-000000000001',
      p_patient_id => 'dc000000-0000-0000-0000-000000000001',
      p_token => 'aaaaaaaabbbbbbbbccccccccdddddddd',
      p_consent_confirmed => true,
      p_owner_name_visibility => 'first_name'
    )$$,
  'With consent recorded, the passport is published'
);

-- 4 Only the hash is kept, so a dump of this table is not a set of live URLs.
select is(
  (select token_hash from public.patient_passports where id = 'fc000000-0000-0000-0000-000000000001'),
  encode(extensions.digest('aaaaaaaabbbbbbbbccccccccdddddddd', 'sha256'), 'hex'),
  'The raw token is never stored, only its hash'
);

-- ---------------------------------------------------------------------------
-- The anonymous surface (5-9)
-- ---------------------------------------------------------------------------

reset role;
set local role anon;

-- 5
select ok(
  not has_table_privilege('anon', 'public.patients', 'SELECT'),
  'Anonymous callers cannot read patients'
);

-- 6
select ok(
  not has_table_privilege('anon', 'public.patient_passports', 'SELECT')
  and not has_table_privilege('anon', 'public.visits', 'SELECT')
  and not has_table_privilege('anon', 'public.preventive_care', 'SELECT')
  and not has_table_privilege('anon', 'public.clients', 'SELECT'),
  'Anonymous callers cannot read passports, records, vaccinations or clients'
);

-- 7 Exactly one door.
select ok(
  has_function_privilege('anon', 'public.passport_by_token(text)', 'EXECUTE'),
  'Anonymous callers may call the passport function'
);

-- 8
select ok(
  (select public.passport_by_token('aaaaaaaabbbbbbbbccccccccdddddddd')) is not null,
  'A valid token returns a passport'
);

-- 9
select is(
  (select public.passport_by_token('aaaaaaaabbbbbbbbccccccccdddddddd')) -> 'animal' ->> 'name',
  'Simba',
  'The animal is named'
);

-- ---------------------------------------------------------------------------
-- What must never appear (10-14)
-- ---------------------------------------------------------------------------

-- 10 The whole reason this surface is narrow.
select ok(
  (select public.passport_by_token('aaaaaaaabbbbbbbbccccccccdddddddd'))::text
    not like '%SECRET PRESCRIPTION TEXT%',
  'Prescriptions never reach the public page'
);

-- 11
select ok(
  (select public.passport_by_token('aaaaaaaabbbbbbbbccccccccdddddddd'))::text
    not like '%SECRET TREATMENT PLAN%',
  'Treatment plans never reach the public page'
);

-- 12 A provisional thought must not appear on the internet under a vet's name.
select ok(
  (select public.passport_by_token('aaaaaaaabbbbbbbbccccccccdddddddd'))::text
    not like '%DRAFT COMPLAINT%',
  'An unsigned record never appears'
);

-- 13 Marked visible is the only way in, and nothing is marked yet.
select is(
  jsonb_array_length(
    (select public.passport_by_token('aaaaaaaabbbbbbbbccccccccdddddddd')) -> 'recent_care'
  ),
  0,
  'A signed record stays private until the vet publishes it deliberately'
);

-- 14 A microchip number is how a stolen animal is traced.
select is(
  (select public.passport_by_token('aaaaaaaabbbbbbbbccccccccdddddddd')) -> 'animal' ->> 'microchip_id',
  null,
  'The microchip is withheld unless it was explicitly enabled'
);

-- ---------------------------------------------------------------------------
-- What the page is for (15-17)
-- ---------------------------------------------------------------------------

-- 15
select is(
  (select public.passport_by_token('aaaaaaaabbbbbbbbccccccccdddddddd'))
    -> 'vaccinations' -> 0 ->> 'vaccine',
  'anti_rabies',
  'Vaccination status is the point of the page'
);

-- 16 Consent said first name only.
select is(
  (select public.passport_by_token('aaaaaaaabbbbbbbbccccccccdddddddd')) ->> 'owner_name',
  'Kwame',
  'The owner name follows the consent setting exactly'
);

-- 17
select is(
  (select public.passport_by_token('aaaaaaaabbbbbbbbccccccccdddddddd'))
    -> 'verified_by' ->> 'veterinarian',
  'Ama Mensah',
  'The page says who vouches for it'
);

-- ---------------------------------------------------------------------------
-- Failure is indistinguishable (18-20)
-- ---------------------------------------------------------------------------

-- 18
select is(
  (select public.passport_by_token('zzzzzzzzyyyyyyyyxxxxxxxxwwwwwwww')),
  null,
  'An unknown token returns nothing'
);

-- 19 Not an error, not a different shape: the same nothing.
select is(
  (select public.passport_by_token('not-a-valid-token')),
  null,
  'A malformed token returns nothing rather than an error'
);

-- 20
select is(
  (select public.passport_by_token(null)),
  null,
  'A missing token returns nothing'
);

-- ---------------------------------------------------------------------------
-- Revocation and rotation (21-23)
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ac000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"ac000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

select public.rotate_passport_token(
  'dc000000-0000-0000-0000-000000000001',
  'eeeeeeeeffffffff11111111gggggggg'
);

reset role;
set local role anon;

-- 21 §10.5: rotation is an emergency action because it kills printed QR codes.
select is(
  (select public.passport_by_token('aaaaaaaabbbbbbbbccccccccdddddddd')),
  null,
  'Rotation kills every QR code already printed'
);

-- 22
select ok(
  (select public.passport_by_token('eeeeeeeeffffffff11111111gggggggg')) is not null,
  'The new token works'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ac000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"ac000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

select public.revoke_patient_passport('dc000000-0000-0000-0000-000000000001');

reset role;
set local role anon;

-- 23
select is(
  (select public.passport_by_token('eeeeeeeeffffffff11111111gggggggg')),
  null,
  'A revoked passport stops answering'
);

-- ---------------------------------------------------------------------------
-- One practice is not another (24)
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ac000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"ac000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}', true);

-- 24
select throws_ok(
  $$select public.revoke_patient_passport('dc000000-0000-0000-0000-000000000001')$$,
  'P0002',
  'Passport not found',
  'One veterinarian cannot revoke another veterinarian''s passport'
);

reset role;

select * from finish();
rollback;
