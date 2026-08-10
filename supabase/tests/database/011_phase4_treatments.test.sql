begin;

create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('a5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-treat-a@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (id, auth_user_id, full_name, phone_display, phone_e164) values
  ('b5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'Vet Treat A', '0243950001', '+233243950001');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a5000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

select public.create_client(
  'c5000000-0000-0000-0000-000000000001', 'VK-C-TRT001', 'Treat Client',
  '024 395 0011', '+233243950011'
);

-- A pet dog, a dairy cow and a laying flock: the three obligation shapes.
select public.create_patient(
  p_id => 'd5000000-0000-0000-0000-000000000001',
  p_patient_code => 'VK-P-TRT001', p_name => 'Bruno',
  p_species => 'dog', p_sex => 'male', p_purpose => 'pet'
);
select public.create_patient(
  p_id => 'd5000000-0000-0000-0000-000000000002',
  p_patient_code => 'VK-P-TRT002', p_name => 'Adwoa',
  p_species => 'cattle', p_sex => 'female', p_purpose => 'milk'
);
select public.create_patient(
  p_id => 'd5000000-0000-0000-0000-000000000003',
  p_patient_code => 'VK-P-TRT003', p_name => 'Layer house 2',
  p_species => 'poultry', p_kind => 'group', p_purpose => 'eggs', p_head_count => 400
);

select public.create_visit('e5000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', now(), 'home_call');
select public.create_visit('e5000000-0000-0000-0000-000000000002', 'd5000000-0000-0000-0000-000000000002', now(), 'field_visit');
select public.create_visit('e5000000-0000-0000-0000-000000000003', 'd5000000-0000-0000-0000-000000000003', now(), 'field_visit');

-- A carried product with known withholding periods.
select public.create_inventory_item(
  'f5000000-0000-0000-0000-000000000001', 'Oxytetracycline 20%', 'drug', 'ml', 100
);

-- ---------------------------------------------------------------------------
-- Which withholding periods a folder owes (1-6)
-- ---------------------------------------------------------------------------

-- 1
select is(
  app_private.required_withdrawals('dog', 'pet'),
  array[]::text[],
  'A pet dog owes nothing'
);

-- 2
select is(
  app_private.required_withdrawals('rabbit', 'pet'),
  array[]::text[],
  'A pet rabbit owes nothing, though the species is farmed'
);

-- 3
select is(
  app_private.required_withdrawals('rabbit', 'meat'),
  array['meat'],
  'A meat rabbit owes meat withholding'
);

-- 4
select ok(
  'milk' = any (app_private.required_withdrawals('cattle', 'milk'))
  and 'meat' = any (app_private.required_withdrawals('cattle', 'milk')),
  'A dairy cow owes both milk and meat'
);

-- 5
select ok(
  'eggs' = any (app_private.required_withdrawals('poultry', 'eggs'))
  and 'meat' = any (app_private.required_withdrawals('poultry', 'eggs')),
  'A laying flock owes both eggs and meat'
);

-- 6
select ok(
  not ('milk' = any (app_private.required_withdrawals('pig', 'meat'))),
  'A pig owes no milk withholding, having none to give'
);

-- ---------------------------------------------------------------------------
-- The rule (7-12)
-- ---------------------------------------------------------------------------

-- 7
select lives_ok(
  $$select public.record_treatment(
      p_id => '15000000-0000-0000-0000-000000000001',
      p_visit_id => 'e5000000-0000-0000-0000-000000000001',
      p_product_name => 'Meloxicam',
      p_dose_value => 1.5, p_dose_unit => 'ml', p_route => 'sc'
    )$$,
  'A pet needs no withholding period'
);

-- 8
select throws_ok(
  $$select public.record_treatment(
      p_id => '15000000-0000-0000-0000-000000000002',
      p_visit_id => 'e5000000-0000-0000-0000-000000000002',
      p_product_name => 'Oxytetracycline',
      p_dose_value => 20, p_dose_unit => 'ml', p_route => 'im'
    )$$,
  '22023',
  'This animal needs a meat and a milk withholding period',
  'A dairy cow cannot be treated without both withholding periods, named together'
);

-- 9
select throws_ok(
  $$select public.record_treatment(
      p_id => '15000000-0000-0000-0000-000000000003',
      p_visit_id => 'e5000000-0000-0000-0000-000000000002',
      p_product_name => 'Oxytetracycline',
      p_dose_value => 20, p_dose_unit => 'ml', p_route => 'im',
      p_milk_withhold_until => '2026-08-20',
      p_withdrawal_source => 'manual'
    )$$,
  '22023',
  'This animal needs a meat withholding period',
  'Half the obligation is not enough'
);

-- 10
select lives_ok(
  $$select public.record_treatment(
      p_id => '15000000-0000-0000-0000-000000000004',
      p_visit_id => 'e5000000-0000-0000-0000-000000000002',
      p_product_name => 'Oxytetracycline',
      p_dose_value => 20, p_dose_unit => 'ml', p_route => 'im',
      p_milk_withhold_until => '2026-08-20',
      p_meat_withhold_until => '2026-09-10',
      p_withdrawal_source => 'manual'
    )$$,
  'Both periods stated, the treatment is recorded'
);

-- 11
select lives_ok(
  $$select public.record_treatment(
      p_id => '15000000-0000-0000-0000-000000000005',
      p_visit_id => 'e5000000-0000-0000-0000-000000000003',
      p_product_name => 'Vitamin supplement',
      p_dose_value => 1, p_dose_unit => 'g/L', p_route => 'in_water',
      p_withdrawal_source => 'none_required'
    )$$,
  'A vet may assert deliberately that nothing is withheld'
);

-- 12
select is(
  (select withdrawal_source from public.treatments where id = '15000000-0000-0000-0000-000000000005'),
  'none_required',
  'The assertion is recorded, not silently assumed'
);

-- ---------------------------------------------------------------------------
-- Computing dates from the formulary (13-17)
-- ---------------------------------------------------------------------------

-- 13
select lives_ok(
  $$select public.set_item_formulary(
      p_id => 'f5000000-0000-0000-0000-000000000001',
      p_active_ingredient => 'Oxytetracycline',
      p_default_route => 'im',
      p_withdrawal_meat_days => 28,
      p_withdrawal_milk_days => 7
    )$$,
  'A carried product can hold its standard withholding periods'
);

-- 14
select lives_ok(
  $$select public.record_treatment(
      p_id => '15000000-0000-0000-0000-000000000006',
      p_visit_id => 'e5000000-0000-0000-0000-000000000002',
      p_product_name => 'Oxytetracycline 20%',
      p_dose_value => 20, p_dose_unit => 'ml', p_route => 'im',
      p_inventory_item_id => 'f5000000-0000-0000-0000-000000000001',
      p_administered_at => '2026-08-10T09:00:00Z'
    )$$,
  'The formulary resolves the periods so the vet does not have to'
);

-- 15
select is(
  (select milk_withhold_until from public.treatments where id = '15000000-0000-0000-0000-000000000006'),
  '2026-08-17'::date,
  'Milk is withheld seven days from the last day given'
);

-- 16
select is(
  (select meat_withhold_until from public.treatments where id = '15000000-0000-0000-0000-000000000006'),
  '2026-09-07'::date,
  'Meat is withheld twenty-eight days from the last day given'
);

-- 17
select lives_ok(
  $$select public.record_treatment(
      p_id => '15000000-0000-0000-0000-000000000007',
      p_visit_id => 'e5000000-0000-0000-0000-000000000002',
      p_product_name => 'Oxytetracycline 20%',
      p_dose_value => 20, p_dose_unit => 'ml', p_route => 'im',
      p_inventory_item_id => 'f5000000-0000-0000-0000-000000000001',
      p_administered_at => '2026-08-10T09:00:00Z',
      p_duration_days => 5
    )$$,
  'A course over several days is recorded'
);

-- ---------------------------------------------------------------------------
-- Course length, idempotency, signed records (18-20)
-- ---------------------------------------------------------------------------

-- 18
select is(
  (select milk_withhold_until from public.treatments where id = '15000000-0000-0000-0000-000000000007'),
  '2026-08-21'::date,
  'Withholding runs from the last day of a course, not the first'
);

-- 19
select is(
  (select public.record_treatment(
      p_id => '15000000-0000-0000-0000-000000000001',
      p_visit_id => 'e5000000-0000-0000-0000-000000000001',
      p_product_name => 'Meloxicam',
      p_dose_value => 1.5, p_dose_unit => 'ml', p_route => 'sc'
  )),
  '15000000-0000-0000-0000-000000000001'::uuid,
  'A retried sync records the dose once, not twice'
);

-- 20
select throws_ok(
  $$select public.complete_visit('e5000000-0000-0000-0000-000000000001');
    select public.record_treatment(
      p_id => '15000000-0000-0000-0000-000000000008',
      p_visit_id => 'e5000000-0000-0000-0000-000000000001',
      p_product_name => 'Meloxicam',
      p_dose_value => 1.5, p_dose_unit => 'ml', p_route => 'sc'
    )$$,
  '22023',
  'This record is signed and can no longer be added to',
  'A signed record cannot have a treatment appended to it'
);

-- ---------------------------------------------------------------------------
-- Giving a drug is one act: the treatment and the stock movement (21-27)
-- ---------------------------------------------------------------------------

select public.restock_inventory_batch(
  p_batch_id => '25000000-0000-0000-0000-000000000001',
  p_movement_id => '45000000-0000-0000-0000-000000000001',
  p_item_id => 'f5000000-0000-0000-0000-000000000001',
  p_quantity => 100,
  p_batch_lot_number => 'LOT-A1',
  p_expiry_date => '2027-01-01'
);

-- 21
select is(
  (select quantity_on_hand from public.inventory_batches where id = '25000000-0000-0000-0000-000000000001'),
  100::numeric(10,2),
  'The batch starts full'
);

-- 22
select lives_ok(
  $$select public.record_treatment(
      p_id => '15000000-0000-0000-0000-000000000010',
      p_visit_id => 'e5000000-0000-0000-0000-000000000002',
      p_product_name => 'Oxytetracycline 20%',
      p_dose_value => 20, p_dose_unit => 'ml', p_route => 'im',
      p_inventory_item_id => 'f5000000-0000-0000-0000-000000000001',
      p_inventory_batch_id => '25000000-0000-0000-0000-000000000001',
      p_movement_id => '35000000-0000-0000-0000-000000000001',
      p_quantity_used => 20
    )$$,
  'Recording a treatment takes the stock in the same act'
);

-- 23
select is(
  (select quantity_on_hand from public.inventory_batches where id = '25000000-0000-0000-0000-000000000001'),
  80::numeric(10,2),
  'The batch is drawn down by what was given'
);

-- 24
select is(
  (select count(*)::int from public.inventory_movements
   where visit_id = 'e5000000-0000-0000-0000-000000000002' and movement_type = 'consumption'),
  1,
  'One movement, not two'
);

-- 25
select is(
  (select public.record_treatment(
      p_id => '15000000-0000-0000-0000-000000000010',
      p_visit_id => 'e5000000-0000-0000-0000-000000000002',
      p_product_name => 'Oxytetracycline 20%',
      p_dose_value => 20, p_dose_unit => 'ml', p_route => 'im',
      p_inventory_item_id => 'f5000000-0000-0000-0000-000000000001',
      p_inventory_batch_id => '25000000-0000-0000-0000-000000000001',
      p_movement_id => '35000000-0000-0000-0000-000000000001',
      p_quantity_used => 20
  )),
  '15000000-0000-0000-0000-000000000010'::uuid,
  'A retried sync returns the same treatment'
);

-- 26
select is(
  (select quantity_on_hand from public.inventory_batches where id = '25000000-0000-0000-0000-000000000001'),
  80::numeric(10,2),
  'A retried sync does not deduct the stock twice'
);

-- 27
select throws_ok(
  $$select public.record_treatment(
      p_id => '15000000-0000-0000-0000-000000000011',
      p_visit_id => 'e5000000-0000-0000-0000-000000000002',
      p_product_name => 'Oxytetracycline 20%',
      p_dose_value => 500, p_dose_unit => 'ml', p_route => 'im',
      p_inventory_item_id => 'f5000000-0000-0000-0000-000000000001',
      p_inventory_batch_id => '25000000-0000-0000-0000-000000000001',
      p_movement_id => '35000000-0000-0000-0000-000000000002',
      p_quantity_used => 500
    )$$,
  '22023',
  NULL,
  'Taking more than the batch holds fails, and takes the treatment with it'
);

reset role;

select * from finish();
rollback;
