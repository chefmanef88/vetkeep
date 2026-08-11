begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('a8000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-conc-a@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a8000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-conc-b@example.test', crypt('Strong-Test-Password-2!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (id, auth_user_id, full_name, phone_display, phone_e164) values
  ('b8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001', 'Vet Conc A', '0243980001', '+233243980001'),
  ('b8000000-0000-0000-0000-000000000002', 'a8000000-0000-0000-0000-000000000002', 'Vet Conc B', '0243980002', '+233243980002');

-- Seeded before the role switch: the drug list is written through RPCs, so
-- authenticated has no INSERT of its own.
-- One product carried without its strength, one with.
insert into public.inventory_items (id, vet_id, item_name, item_type, unit, active)
values ('f8000000-0000-0000-0000-000000000001', 'b8000000-0000-0000-0000-000000000001', 'Unknown oxytet', 'drug', 'ml', true);

insert into public.inventory_items (id, vet_id, item_name, item_type, unit, active, concentration_value, concentration_unit)
values ('f8000000-0000-0000-0000-000000000002', 'b8000000-0000-0000-0000-000000000001', 'Known oxytet', 'drug', 'ml', true, 200, 'mg_per_ml');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a8000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a8000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

select public.create_client(
  'c8000000-0000-0000-0000-000000000001', 'VK-C-CNC001', 'Conc Client',
  '024 398 0011', '+233243980011'
);

-- A pet, so withholding never gets in the way of what is being tested here.
select public.create_patient(
  p_id => 'd8000000-0000-0000-0000-000000000001',
  p_patient_code => 'VK-P-CNC001', p_name => 'Rex',
  p_species => 'dog', p_sex => 'male'
);

select public.create_visit('e8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000001', now(), 'home_call');

-- ---------------------------------------------------------------------------
-- A strength typed off the bottle is accepted and marked as such (1-3)
-- ---------------------------------------------------------------------------

-- 1
select lives_ok(
  $$select public.record_treatment(
      p_id => '18000000-0000-0000-0000-000000000001',
      p_visit_id => 'e8000000-0000-0000-0000-000000000001',
      p_product_name => 'A bottle not on the list',
      p_dose_value => 3, p_dose_unit => 'ml', p_route => 'sc',
      p_dose_rate_value => 20, p_dose_rate_unit => 'mg_per_kg', p_weight_kg_used => 30,
      p_concentration_value => 200, p_concentration_unit => 'mg_per_ml',
      p_concentration_source => 'manual'
    )$$,
  'A strength read off the bottle is accepted without the product being on file'
);

-- 2
select is(
  (select concentration_source from public.treatments where id = '18000000-0000-0000-0000-000000000001'),
  'manual',
  'The record says the strength was typed, not read from the drug list'
);

-- 3
select is(
  (select concentration_value from public.treatments where id = '18000000-0000-0000-0000-000000000001'),
  200::numeric,
  'The strength itself is kept, so the dose can be rechecked'
);

-- ---------------------------------------------------------------------------
-- A strength from the drug list says so (4)
-- ---------------------------------------------------------------------------

select public.record_treatment(
  p_id => '18000000-0000-0000-0000-000000000002',
  p_visit_id => 'e8000000-0000-0000-0000-000000000001',
  p_product_name => 'Known oxytet',
  p_dose_value => 3, p_dose_unit => 'ml', p_route => 'sc',
  p_inventory_item_id => 'f8000000-0000-0000-0000-000000000002',
  p_concentration_value => 200, p_concentration_unit => 'mg_per_ml',
  p_concentration_source => 'formulary'
);

-- 4
select is(
  (select concentration_source from public.treatments where id = '18000000-0000-0000-0000-000000000002'),
  'formulary',
  'A strength taken from the drug list is recorded as such'
);

-- ---------------------------------------------------------------------------
-- The pairing holds (5-7)
-- ---------------------------------------------------------------------------

-- 5
select throws_ok(
  $$select public.record_treatment(
      p_id => '18000000-0000-0000-0000-000000000003',
      p_visit_id => 'e8000000-0000-0000-0000-000000000001',
      p_product_name => 'Sourceless', p_dose_value => 1, p_dose_unit => 'ml',
      p_route => 'sc', p_concentration_source => 'manual'
    )$$,
  '22023',
  'A concentration source needs a concentration',
  'A source with no strength is refused'
);

-- 6
select throws_ok(
  $$select public.record_treatment(
      p_id => '18000000-0000-0000-0000-000000000004',
      p_visit_id => 'e8000000-0000-0000-0000-000000000001',
      p_product_name => 'Bad source', p_dose_value => 1, p_dose_unit => 'ml',
      p_route => 'sc',
      p_concentration_value => 100, p_concentration_unit => 'mg_per_ml',
      p_concentration_source => 'guessed'
    )$$,
  '22023',
  'Invalid concentration source',
  'An unrecognised source is refused'
);

select public.record_treatment(
  p_id => '18000000-0000-0000-0000-000000000005',
  p_visit_id => 'e8000000-0000-0000-0000-000000000001',
  p_product_name => 'Old client', p_dose_value => 1, p_dose_unit => 'ml',
  p_route => 'sc',
  p_concentration_value => 100, p_concentration_unit => 'mg_per_ml'
);

-- 7 A client that predates the column gets the stricter reading, not a false
-- claim that the drug list vouched for the number.
select is(
  (select concentration_source from public.treatments where id = '18000000-0000-0000-0000-000000000005'),
  'manual',
  'A strength sent without a source is treated as manual, never as formulary'
);

-- ---------------------------------------------------------------------------
-- Keeping a typed strength on the product (8-11)
-- ---------------------------------------------------------------------------

-- 8
select lives_ok(
  $$select public.set_item_concentration(
      'f8000000-0000-0000-0000-000000000001', 300, 'mg_per_ml'
    )$$,
  'A strength typed at a visit can fill the gap on a carried product'
);

-- 9
select is(
  (select concentration_value from public.inventory_items where id = 'f8000000-0000-0000-0000-000000000001'),
  300::numeric,
  'The drug list now carries it, so it is not retyped next visit'
);

-- 10 Correcting a strength already on file is a deliberate act on the products
-- screen, not a side effect of a consultation.
select throws_ok(
  $$select public.set_item_concentration(
      'f8000000-0000-0000-0000-000000000002', 100, 'mg_per_ml'
    )$$,
  '42501',
  'This product already has a strength on file. Change it on the products screen',
  'A strength already on file is not silently overwritten from a visit'
);

-- 11
select throws_ok(
  $$select public.set_item_concentration(
      'f8000000-0000-0000-0000-000000000001', 10, 'grams'
    )$$,
  '22023',
  'Invalid concentration unit',
  'An unrecognised unit is refused'
);

-- 12
select throws_ok(
  $$select public.set_item_concentration(
      'f8000000-0000-0000-0000-000000000001', 0, 'mg_per_ml'
    )$$,
  '22023',
  'Enter the strength of the product',
  'A strength of zero is refused'
);

-- ---------------------------------------------------------------------------
-- Another vet's drug list is not reachable (13-14)
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a8000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"a8000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}', true);

-- 13
select throws_ok(
  $$select public.set_item_concentration(
      'f8000000-0000-0000-0000-000000000001', 50, 'mg_per_ml'
    )$$,
  'P0002',
  'Product not found',
  'One vet cannot set a strength on another vet''s product'
);

-- Read back as the owner: under vet B's role RLS hides the row entirely, so the
-- check would pass on a null and prove nothing.
reset role;

-- 14
select is(
  (select concentration_value from public.inventory_items where id = 'f8000000-0000-0000-0000-000000000001'),
  300::numeric,
  'And the other vet''s product is unchanged'
);

select * from finish();
rollback;
