begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('aa000000-0000-0000-0000-0000000000f1'::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-group@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (id, auth_user_id, full_name, phone_display, phone_e164) values
  ('ba000000-0000-0000-0000-0000000000f1'::uuid, 'aa000000-0000-0000-0000-0000000000f1'::uuid, 'Vet Group', '0243910051', '+233243910051');

insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
  ('5e000000-0000-0000-0000-0000000000f1'::uuid, 'aa000000-0000-0000-0000-0000000000f1'::uuid, now(), now(), 'aal2');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa000000-0000-0000-0000-0000000000f1', true);
select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-0000000000f1","role":"authenticated","aal":"aal2","session_id":"5e000000-0000-0000-0000-0000000000f1"}', true);

select public.create_client(
  'ca000000-0000-0000-0000-0000000000f1'::uuid, 'VK-C-GP0001', 'Flock Owner',
  '024 391 0052', '+233243910052'
);

-- One flock and one dog, so the same call can be made against each.
select public.create_patient(
  p_id => 'da000000-0000-0000-0000-0000000000f1'::uuid,
  p_patient_code => 'VK-P-GP0001', p_name => 'Layer house 3',
  p_species => 'poultry', p_kind => 'group', p_purpose => 'eggs',
  p_head_count => 400
);
select public.create_patient(
  p_id => 'da000000-0000-0000-0000-0000000000f2'::uuid,
  p_patient_code => 'VK-P-GP0002', p_name => 'Bruno',
  p_species => 'dog', p_sex => 'male'
);

select public.create_visit(
  p_id => 'ea000000-0000-0000-0000-0000000000f1'::uuid,
  p_patient_id => 'da000000-0000-0000-0000-0000000000f1'::uuid,
  p_visit_date => now(), p_visit_type => 'field_visit'
);
select public.create_visit(
  p_id => 'ea000000-0000-0000-0000-0000000000f2'::uuid,
  p_patient_id => 'da000000-0000-0000-0000-0000000000f2'::uuid,
  p_visit_date => now(), p_visit_type => 'home_call'
);

-- ---------------------------------------------------------------------------
-- A group record carries the population (1-3)
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select public.update_visit_draft(
      p_id => 'ea000000-0000-0000-0000-0000000000f1'::uuid,
      p_visit_date => now(), p_visit_type => 'field_visit',
      p_group_size_at_visit => 400, p_animals_affected => 11,
      p_animals_dead => 3, p_housing_unit => 'House 3'
    )$$,
  'A group visit accepts the population figures'
);

-- 2
select is(
  (select animals_affected from public.visits where id = 'ea000000-0000-0000-0000-0000000000f1'::uuid),
  11,
  'How many were affected is recorded'
);

-- 3 The denominator is held per visit, not read from the folder: a flock is not
-- the same size in March as it was in January.
select is(
  (select group_size_at_visit from public.visits where id = 'ea000000-0000-0000-0000-0000000000f1'::uuid),
  400,
  'The group size on the day is recorded with it'
);

-- ---------------------------------------------------------------------------
-- The sample animal's vitals survive alongside them (4)
-- ---------------------------------------------------------------------------

-- 4 A vet examines representative animals on a farm visit, and those readings
-- are real. They describe a sample rather than the subject, and both belong.
select lives_ok(
  $$select public.update_visit_draft(
      p_id => 'ea000000-0000-0000-0000-0000000000f1'::uuid,
      p_visit_date => now(), p_visit_type => 'field_visit',
      p_temperature_c => 41.2, p_heart_rate_bpm => 180,
      p_group_size_at_visit => 400, p_animals_affected => 11
    )$$,
  'A group visit takes vitals for a sample animal as well'
);

-- ---------------------------------------------------------------------------
-- An individual cannot carry them (5)
-- ---------------------------------------------------------------------------

-- 5 Refused rather than ignored. Silently dropping the number would leave the
-- vet believing it was recorded, and "3 of 1" is not a thing a folder can say.
select throws_ok(
  $$select public.update_visit_draft(
      p_id => 'ea000000-0000-0000-0000-0000000000f2'::uuid,
      p_visit_date => now(), p_visit_type => 'home_call',
      p_animals_affected => 3
    )$$,
  '22023',
  'Group figures belong to a group folder',
  'A dog''s record refuses a population count'
);

-- ---------------------------------------------------------------------------
-- The counts have to be possible (6-8)
-- ---------------------------------------------------------------------------

-- 6
select throws_ok(
  $$select public.update_visit_draft(
      p_id => 'ea000000-0000-0000-0000-0000000000f1'::uuid,
      p_visit_date => now(), p_visit_type => 'field_visit',
      p_group_size_at_visit => 10, p_animals_affected => 11
    )$$,
  '22023',
  'More affected than there are animals',
  'More affected than the group holds is refused'
);

-- 7
select throws_ok(
  $$select public.update_visit_draft(
      p_id => 'ea000000-0000-0000-0000-0000000000f1'::uuid,
      p_visit_date => now(), p_visit_type => 'field_visit',
      p_group_size_at_visit => 10, p_animals_dead => 11
    )$$,
  '22023',
  'More dead than there are animals',
  'More dead than the group holds is refused'
);

-- 8 Deaths are deliberately not constrained against the affected count: a
-- peracute death may never have been entered as a case, and refusing that
-- would make the vet invent a number to get past the form.
select lives_ok(
  $$select public.update_visit_draft(
      p_id => 'ea000000-0000-0000-0000-0000000000f1'::uuid,
      p_visit_date => now(), p_visit_type => 'field_visit',
      p_group_size_at_visit => 400, p_animals_affected => 2, p_animals_dead => 3
    )$$,
  'More dead than recorded as affected is allowed, because that happens'
);

select * from finish();
rollback;
