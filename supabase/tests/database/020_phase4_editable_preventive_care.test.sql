begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('ae000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-edit-a@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (id, auth_user_id, full_name, phone_display, phone_e164) values
  ('be000000-0000-0000-0000-000000000001', 'ae000000-0000-0000-0000-000000000001', 'Vet Edit A', '0243950001', '+233243950001');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ae000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"ae000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

select public.create_client(
  'ce000000-0000-0000-0000-000000000001', 'VK-C-EDT001', 'Edit Client',
  '024 395 0011', '+233243950011'
);
select public.create_patient(
  p_id => 'de000000-0000-0000-0000-000000000001',
  p_patient_code => 'VK-P-EDT001', p_name => 'Bingo',
  p_species => 'dog', p_sex => 'male'
);

-- Standalone, attached to no consultation.
select public.record_preventive_care(
  p_id => '4e000000-0000-0000-0000-000000000001',
  p_patient_id => 'de000000-0000-0000-0000-000000000001',
  p_kind => 'ectoparasite_control',
  p_product_name => 'Frontlin',
  p_date_given => current_date,
  p_route => 'topical',
  p_target_parasites => array['ticks']
);

-- ---------------------------------------------------------------------------
-- A typing mistake can be corrected (1-4)
-- ---------------------------------------------------------------------------

-- 1 The whole point: deleting and re-recording loses the original entry and
-- puts a deletion in the audit trail for what was a typo.
select lives_ok(
  $$select public.update_preventive_care(
      p_id => '4e000000-0000-0000-0000-000000000001',
      p_product_name => 'Frontline',
      p_date_given => current_date,
      p_batch_lot_number => 'LOT-2291',
      p_target_parasites => array['ticks', 'fleas']
    )$$,
  'A preventive care entry can be corrected'
);

-- 2
select is(
  (select product_name from public.preventive_care where id = '4e000000-0000-0000-0000-000000000001'),
  'Frontline',
  'The correction is stored'
);

-- 3 The parasites can be corrected too: a spot-on covers more than was first
-- recorded more often than not.
select is(
  (select array_length(target_parasites, 1)
   from public.preventive_care where id = '4e000000-0000-0000-0000-000000000001'),
  2,
  'What was treated can be corrected'
);

-- 4
select is(
  (select count(*)::int from public.audit_events
   where vet_id = 'be000000-0000-0000-0000-000000000001' and action = 'preventive_care.updated'),
  1,
  'The correction is audited, because somebody eventually asks what was written first'
);

-- ---------------------------------------------------------------------------
-- A correction cannot reach a state creation would refuse (5-7)
-- ---------------------------------------------------------------------------

-- 5
select throws_ok(
  $$select public.update_preventive_care(
      p_id => '4e000000-0000-0000-0000-000000000001',
      p_product_name => 'Frontline',
      p_date_given => current_date + 5,
      p_target_parasites => array['ticks']
    )$$,
  '22023',
  'A date given cannot be in the future',
  'A correction cannot move the date into the future'
);

-- 6
select throws_ok(
  $$select public.update_preventive_care(
      p_id => '4e000000-0000-0000-0000-000000000001',
      p_product_name => 'Frontline',
      p_date_given => current_date,
      p_target_parasites => array['dragons']
    )$$,
  '22023',
  'Invalid parasite',
  'A correction cannot introduce an unrecognised parasite'
);

-- 7 The kind is fixed at creation. A vaccination meant to be a worming is a
-- wrong entry, not a mistyped one.
select throws_ok(
  $$select public.update_preventive_care(
      p_id => '4e000000-0000-0000-0000-000000000001',
      p_product_name => 'Frontline',
      p_date_given => current_date,
      p_vaccine_type => 'anti_rabies'
    )$$,
  '22023',
  'Parasite control does not carry a vaccine type',
  'A correction cannot turn parasite control into a vaccination'
);

-- ---------------------------------------------------------------------------
-- Signing closes it (8-9)
-- ---------------------------------------------------------------------------

select public.create_visit(
  p_id => 'ee000000-0000-0000-0000-000000000001',
  p_patient_id => 'de000000-0000-0000-0000-000000000001',
  p_visit_date => now(), p_visit_type => 'home_call'
);
select public.record_preventive_care(
  p_id => '4e000000-0000-0000-0000-000000000002',
  p_patient_id => 'de000000-0000-0000-0000-000000000001',
  p_visit_id => 'ee000000-0000-0000-0000-000000000001',
  p_kind => 'deworming', p_product_name => 'Albendazol',
  p_date_given => current_date, p_route => 'oral'
);

-- 8 Editable while the consultation is still a draft.
select lives_ok(
  $$select public.update_preventive_care(
      p_id => '4e000000-0000-0000-0000-000000000002',
      p_product_name => 'Albendazole',
      p_date_given => current_date
    )$$,
  'An entry on a draft consultation is still editable'
);

select public.complete_visit('ee000000-0000-0000-0000-000000000001');

-- 9 §8.2 does not carve out an exception for a vaccine.
select throws_ok(
  $$select public.update_preventive_care(
      p_id => '4e000000-0000-0000-0000-000000000002',
      p_product_name => 'Something else',
      p_date_given => current_date
    )$$,
  '42501',
  'This record is signed and can no longer be changed',
  'Signing the consultation locks the entry with it'
);

-- ---------------------------------------------------------------------------
-- Concurrency (10)
-- ---------------------------------------------------------------------------

-- 10 A stale write is refused rather than applied over somebody else's
-- correction.
select throws_ok(
  $$select public.update_preventive_care(
      p_id => '4e000000-0000-0000-0000-000000000001',
      p_product_name => 'Stale write',
      p_date_given => current_date,
      p_target_parasites => array['ticks'],
      p_base_server_version => 1
    )$$,
  '40001',
  null,
  'A stale version is refused'
);

reset role;

select * from finish();
rollback;
