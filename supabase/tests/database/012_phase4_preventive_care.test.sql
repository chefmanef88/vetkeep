begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('a6000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-prev-a@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (id, auth_user_id, full_name, phone_display, phone_e164) values
  ('b6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'Vet Prev A', '0243960001', '+233243960001');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a6000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a6000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

select public.create_client(
  'c6000000-0000-0000-0000-000000000001', 'VK-C-PRV001', 'Prev Client',
  '024 396 0011', '+233243960011'
);
select public.create_patient(
  p_id => 'd6000000-0000-0000-0000-000000000001',
  p_patient_code => 'VK-P-PRV001', p_name => 'Bruno',
  p_species => 'dog', p_sex => 'male', p_purpose => 'pet'
);
select public.create_patient(
  p_id => 'd6000000-0000-0000-0000-000000000002',
  p_patient_code => 'VK-P-PRV002', p_name => 'Layer house 2',
  p_species => 'poultry', p_kind => 'group', p_purpose => 'eggs', p_head_count => 400
);

-- ---------------------------------------------------------------------------
-- Vaccination (1-6)
-- ---------------------------------------------------------------------------

-- 1
select lives_ok(
  $$select public.record_preventive_care(
      p_id => '16000000-0000-0000-0000-000000000001',
      p_patient_id => 'd6000000-0000-0000-0000-000000000001',
      p_kind => 'vaccination',
      p_vaccine_type => 'anti_rabies',
      p_product_name => 'Rabisin',
      p_manufacturer => 'Boehringer',
      p_batch_lot_number => 'RB-4471',
      p_dose => '1 ml',
      p_route => 'sc',
      p_date_given => current_date,
      p_next_due_date => current_date + 365
    )$$,
  'A rabies vaccination is recorded with its brand, batch and next date'
);

-- 2
select is(
  (select batch_lot_number from public.preventive_care where id = '16000000-0000-0000-0000-000000000001'),
  'RB-4471',
  'The batch number is kept, since it is what a reaction is traced through'
);

-- 3
select throws_ok(
  $$select public.record_preventive_care(
      p_id => gen_random_uuid(),
      p_patient_id => 'd6000000-0000-0000-0000-000000000001',
      p_kind => 'vaccination',
      p_product_name => 'Some vaccine',
      p_date_given => current_date
    )$$,
  '22023',
  'Choose which vaccine was given',
  'A vaccination without a type could never be searched for or reminded about'
);

-- 4
select throws_ok(
  $$select public.record_preventive_care(
      p_id => gen_random_uuid(),
      p_patient_id => 'd6000000-0000-0000-0000-000000000001',
      p_kind => 'vaccination',
      p_vaccine_type => 'distemper_special',
      p_product_name => 'Unknown',
      p_date_given => current_date
    )$$,
  '23514',
  NULL,
  'A vaccine outside the controlled list is refused'
);

-- 5
select throws_ok(
  $$select public.record_preventive_care(
      p_id => gen_random_uuid(),
      p_patient_id => 'd6000000-0000-0000-0000-000000000001',
      p_kind => 'vaccination',
      p_vaccine_type => 'anti_rabies',
      p_product_name => 'Rabisin',
      p_date_given => current_date + 1
    )$$,
  '22023',
  'A date given cannot be in the future',
  'Recording a future dose would make an animal look protected when it is not'
);

-- 6
select throws_ok(
  $$select public.record_preventive_care(
      p_id => gen_random_uuid(),
      p_patient_id => 'd6000000-0000-0000-0000-000000000001',
      p_kind => 'vaccination',
      p_vaccine_type => 'anti_rabies',
      p_product_name => 'Rabisin',
      p_date_given => current_date,
      p_next_due_date => current_date - 1
    )$$,
  '22023',
  'The next dose cannot be due before the one just given',
  'A next dose in the past would show as overdue the moment it was saved'
);

-- ---------------------------------------------------------------------------
-- Deworming (7-10)
-- ---------------------------------------------------------------------------

-- 7
select lives_ok(
  $$select public.record_preventive_care(
      p_id => '16000000-0000-0000-0000-000000000002',
      p_patient_id => 'd6000000-0000-0000-0000-000000000001',
      p_kind => 'deworming',
      p_product_name => 'Albendazole',
      p_dose => '1 tablet per 10 kg',
      p_route => 'oral',
      p_date_given => current_date,
      p_next_due_date => current_date + 90
    )$$,
  'A deworming is recorded with what was used and how much'
);

-- 8
select is(
  (select dose from public.preventive_care where id = '16000000-0000-0000-0000-000000000002'),
  '1 tablet per 10 kg',
  'The amount given is kept as the vet said it'
);

-- 9
select throws_ok(
  $$select public.record_preventive_care(
      p_id => gen_random_uuid(),
      p_patient_id => 'd6000000-0000-0000-0000-000000000001',
      p_kind => 'deworming',
      p_vaccine_type => 'anti_rabies',
      p_product_name => 'Albendazole',
      p_date_given => current_date
    )$$,
  '22023',
  'A dewormer does not carry a vaccine type',
  'A dewormer cannot be given a vaccine type'
);

-- 10
select is(
  (select count(*)::int from public.preventive_care
   where patient_id = 'd6000000-0000-0000-0000-000000000001' and deleted_at is null),
  2,
  'Both live in one history, which is how a vet reads them'
);

-- ---------------------------------------------------------------------------
-- Groups, idempotency, tenancy (11-14)
-- ---------------------------------------------------------------------------

-- 11
select lives_ok(
  $$select public.record_preventive_care(
      p_id => '16000000-0000-0000-0000-000000000003',
      p_patient_id => 'd6000000-0000-0000-0000-000000000002',
      p_kind => 'vaccination',
      p_vaccine_type => 'newcastle',
      p_product_name => 'Lasota',
      p_route => 'in_water',
      p_animals_treated => 400,
      p_date_given => current_date,
      p_next_due_date => current_date + 90
    )$$,
  'A whole flock can be vaccinated in one record'
);

-- 12
select is(
  (select animals_treated from public.preventive_care where id = '16000000-0000-0000-0000-000000000003'),
  400,
  'How many birds were done is kept'
);

-- 13
select is(
  (select public.record_preventive_care(
      p_id => '16000000-0000-0000-0000-000000000003',
      p_patient_id => 'd6000000-0000-0000-0000-000000000002',
      p_kind => 'vaccination',
      p_vaccine_type => 'newcastle',
      p_product_name => 'Lasota',
      p_date_given => current_date
  )),
  '16000000-0000-0000-0000-000000000003'::uuid,
  'A retried sync records the round once, not twice'
);

-- 14
select throws_ok(
  $$select public.record_preventive_care(
      p_id => gen_random_uuid(),
      p_patient_id => '00000000-0000-0000-0000-0000000000ff',
      p_kind => 'deworming',
      p_product_name => 'Albendazole',
      p_date_given => current_date
    )$$,
  'P0002',
  'Folder not found',
  'A folder that is not yours cannot be written to'
);

reset role;

select * from finish();
rollback;
