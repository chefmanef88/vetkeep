begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('ad000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-ecto-a@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (id, auth_user_id, full_name, phone_display, phone_e164) values
  ('bd000000-0000-0000-0000-000000000001', 'ad000000-0000-0000-0000-000000000001', 'Vet Ecto A', '0243940001', '+233243940001');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ad000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"ad000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

select public.create_client(
  'cd000000-0000-0000-0000-000000000001', 'VK-C-ECT001', 'Ecto Client',
  '024 394 0011', '+233243940011'
);

-- ---------------------------------------------------------------------------
-- Species accepts what a veterinarian types (1-6)
-- ---------------------------------------------------------------------------

-- 1 The reported complaint: 'canine' was rejected.
select lives_ok(
  $$select public.create_patient(
      p_id => 'dd000000-0000-0000-0000-000000000001',
      p_patient_code => 'VK-P-ECT001', p_name => 'Rex',
      p_species => 'canine', p_sex => 'male'
    )$$,
  'canine is accepted'
);

-- 2
select is(
  (select species from public.patients where id = 'dd000000-0000-0000-0000-000000000001'),
  'dog',
  'and is stored as dog, so every species-driven rule still applies'
);

-- 3 The worse half: the web form's own placeholder said "Dog".
select lives_ok(
  $$select public.create_patient(
      p_id => 'dd000000-0000-0000-0000-000000000002',
      p_patient_code => 'VK-P-ECT002', p_name => 'Whiskers',
      p_species => 'Feline', p_sex => 'female'
    )$$,
  'A capital letter is not a validation error'
);

-- 4
select is(
  (select species from public.patients where id = 'dd000000-0000-0000-0000-000000000002'),
  'cat',
  'Feline is stored as cat'
);

-- 5 Whitespace from a paste should not be a rejection either.
select lives_ok(
  $$select public.create_patient(
      p_id => 'dd000000-0000-0000-0000-000000000003',
      p_patient_code => 'VK-P-ECT003', p_name => 'Daisy',
      p_species => '  COW  ', p_purpose => 'milk', p_sex => 'female'
    )$$,
  'Surrounding whitespace and case are both tolerated'
);

-- 6 'avian' is deliberately not mapped: this product distinguishes a pet bird
-- from poultry, and guessing would put a budgerigar on a food animal pathway.
select throws_ok(
  $$select public.create_patient(
      p_id => 'dd000000-0000-0000-0000-000000000009',
      p_patient_code => 'VK-P-ECT009', p_name => 'Ambiguous',
      p_species => 'avian', p_sex => 'unknown'
    )$$,
  '22023',
  'Invalid species',
  'avian is refused rather than guessed, because it does not say bird or poultry'
);

-- ---------------------------------------------------------------------------
-- Ectoparasite control is recordable (7-12)
-- ---------------------------------------------------------------------------

-- 7
select lives_ok(
  $$select public.record_preventive_care(
      p_id => '3d000000-0000-0000-0000-000000000001',
      p_patient_id => 'dd000000-0000-0000-0000-000000000001',
      p_kind => 'ectoparasite_control',
      p_product_name => 'Frontline',
      p_date_given => current_date,
      p_route => 'topical',
      p_next_due_date => current_date + 30,
      p_target_parasites => array['ticks', 'fleas']
    )$$,
  'Tick and flea control can be recorded'
);

-- 8 One spot-on covers both, so both are kept.
select is(
  (select array_length(target_parasites, 1)
   from public.preventive_care where id = '3d000000-0000-0000-0000-000000000001'),
  2,
  'More than one parasite can be targeted by a single product'
);

-- 9
select ok(
  (select target_parasites @> array['ticks']::text[]
   from public.preventive_care where id = '3d000000-0000-0000-0000-000000000001'),
  'The parasites treated are what was recorded'
);

-- 10 Mites matter: mange is the reason a great many dogs are presented.
select lives_ok(
  $$select public.record_preventive_care(
      p_id => '3d000000-0000-0000-0000-000000000002',
      p_patient_id => 'dd000000-0000-0000-0000-000000000001',
      p_kind => 'ectoparasite_control',
      p_product_name => 'Amitraz dip',
      p_date_given => current_date,
      p_route => 'topical',
      p_target_parasites => array['mites']
    )$$,
  'Mange treatment is recordable'
);

-- 11
select throws_ok(
  $$select public.record_preventive_care(
      p_id => '3d000000-0000-0000-0000-000000000003',
      p_patient_id => 'dd000000-0000-0000-0000-000000000001',
      p_kind => 'ectoparasite_control',
      p_product_name => 'Something',
      p_date_given => current_date,
      p_target_parasites => array['dragons']
    )$$,
  '22023',
  'Invalid parasite',
  'An unrecognised parasite is refused'
);

-- 12 A rabies shot does not target ticks. Keeping the column meaningful is
-- cheaper than explaining it later.
select throws_ok(
  $$select public.record_preventive_care(
      p_id => '3d000000-0000-0000-0000-000000000004',
      p_patient_id => 'dd000000-0000-0000-0000-000000000001',
      p_kind => 'vaccination',
      p_vaccine_type => 'anti_rabies',
      p_product_name => 'Rabisin',
      p_date_given => current_date,
      p_target_parasites => array['ticks']
    )$$,
  '22023',
  'Only ectoparasite control targets a parasite',
  'A vaccination cannot carry a parasite target'
);

-- ---------------------------------------------------------------------------
-- The three kinds coexist (13-14)
-- ---------------------------------------------------------------------------

select public.record_preventive_care(
  p_id => '3d000000-0000-0000-0000-000000000005',
  p_patient_id => 'dd000000-0000-0000-0000-000000000001',
  p_kind => 'deworming', p_product_name => 'Albendazole',
  p_date_given => current_date, p_route => 'oral'
);
select public.record_preventive_care(
  p_id => '3d000000-0000-0000-0000-000000000006',
  p_patient_id => 'dd000000-0000-0000-0000-000000000001',
  p_kind => 'vaccination', p_vaccine_type => 'anti_rabies',
  p_product_name => 'Rabisin', p_date_given => current_date, p_route => 'sc'
);

-- 13
select is(
  (select count(distinct kind)::int from public.preventive_care
   where patient_id = 'dd000000-0000-0000-0000-000000000001'),
  3,
  'Vaccination, worming and parasite control sit side by side on one folder'
);

-- 14
select throws_ok(
  $$select public.record_preventive_care(
      p_id => '3d000000-0000-0000-0000-000000000007',
      p_patient_id => 'dd000000-0000-0000-0000-000000000001',
      p_kind => 'grooming', p_product_name => 'Shampoo',
      p_date_given => current_date
    )$$,
  '22023',
  'Invalid preventive care kind',
  'An unknown kind is still refused'
);

-- ---------------------------------------------------------------------------
-- The passport carries all three (15-18)
-- ---------------------------------------------------------------------------

select public.create_patient_owner(
  '0d000000-0000-0000-0000-000000000001',
  'dd000000-0000-0000-0000-000000000001',
  'cd000000-0000-0000-0000-000000000001'
);

select public.enable_patient_passport(
  p_id => 'fd000000-0000-0000-0000-000000000001',
  p_patient_id => 'dd000000-0000-0000-0000-000000000001',
  p_token => 'ectoparasitetokenaaaaaaaaaaaaaaaa',
  p_consent_confirmed => true
);

reset role;
set local role anon;

-- 15
select is(
  jsonb_array_length(
    (select public.passport_by_token('ectoparasitetokenaaaaaaaaaaaaaaaa')) -> 'dewormings'
  ),
  1,
  'Worming appears on the passport'
);

-- 16 A boarding kennel cares about this as much as about rabies.
select is(
  jsonb_array_length(
    (select public.passport_by_token('ectoparasitetokenaaaaaaaaaaaaaaaa')) -> 'parasite_control'
  ),
  2,
  'Tick, flea and mite control appears on the passport'
);

-- 17
select ok(
  (select public.passport_by_token('ectoparasitetokenaaaaaaaaaaaaaaaa'))::text like '%ticks%',
  'The parasites treated are shown, not just the product'
);

-- 18 The allow-list still holds: adding sections must not widen what leaks.
select ok(
  not ((select public.passport_by_token('ectoparasitetokenaaaaaaaaaaaaaaaa')) ? 'treatments')
  and not ((select public.passport_by_token('ectoparasitetokenaaaaaaaaaaaaaaaa')) ? 'notes'),
  'No clinical section crept in alongside the new ones'
);

reset role;

select * from finish();
rollback;
