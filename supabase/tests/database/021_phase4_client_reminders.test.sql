begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('af000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-rem-a@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (id, auth_user_id, full_name, phone_display, phone_e164) values
  ('bf000000-0000-0000-0000-000000000001', 'af000000-0000-0000-0000-000000000001', 'Vet Rem A', '0243960001', '+233243960001');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'af000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"af000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

-- One client who consented, one who did not.
select public.create_client(
  p_id => 'cf000000-0000-0000-0000-000000000001', p_client_code => 'VK-C-REM001',
  p_name => 'Consenting Client', p_phone_display => '024 396 0011',
  p_phone_e164 => '+233243960011', p_communication_consent => true
);
select public.create_client(
  p_id => 'cf000000-0000-0000-0000-000000000002', p_client_code => 'VK-C-REM002',
  p_name => 'Quiet Client', p_phone_display => '024 396 0022',
  p_phone_e164 => '+233243960022', p_communication_consent => false
);

select public.create_patient(
  p_id => 'df000000-0000-0000-0000-000000000001',
  p_patient_code => 'VK-P-REM001', p_name => 'Bella',
  p_species => 'cattle', p_purpose => 'milk', p_sex => 'female'
);
select public.create_patient_owner(
  '0f000000-0000-0000-0000-000000000001',
  'df000000-0000-0000-0000-000000000001',
  'cf000000-0000-0000-0000-000000000001'
);

select public.create_patient(
  p_id => 'df000000-0000-0000-0000-000000000002',
  p_patient_code => 'VK-P-REM002', p_name => 'Silent',
  p_species => 'dog', p_sex => 'male'
);
select public.create_patient_owner(
  '0f000000-0000-0000-0000-000000000002',
  'df000000-0000-0000-0000-000000000002',
  'cf000000-0000-0000-0000-000000000002'
);

-- ---------------------------------------------------------------------------
-- A draft promises nothing (1-2)
-- ---------------------------------------------------------------------------

select public.create_visit(
  p_id => 'ef000000-0000-0000-0000-000000000001',
  p_patient_id => 'df000000-0000-0000-0000-000000000001',
  p_visit_date => now(), p_visit_type => 'field_visit'
);
select public.update_visit_draft(
  p_id => 'ef000000-0000-0000-0000-000000000001',
  p_visit_date => now(), p_visit_type => 'field_visit',
  p_next_review_date => (current_date + 30)
);

-- 1 Only a signed record's review date is a fact the veterinarian asserted.
select is(
  (select count(*)::int from public.client_reminders where visit_id = 'ef000000-0000-0000-0000-000000000001'),
  0,
  'A draft with a review date queues nothing'
);

select public.complete_visit('ef000000-0000-0000-0000-000000000001');

-- 2
select is(
  (select count(*)::int from public.client_reminders
   where visit_id = 'ef000000-0000-0000-0000-000000000001' and status = 'queued'),
  1,
  'Signing the record queues the follow-up in the same transaction'
);

-- 3
select is(
  (select reminder_type from public.client_reminders where visit_id = 'ef000000-0000-0000-0000-000000000001'),
  'follow_up',
  'It is a follow-up reminder'
);

-- 4 It has to reach somebody.
select is(
  (select recipient_e164 from public.client_reminders where visit_id = 'ef000000-0000-0000-0000-000000000001'),
  '+233243960011',
  'Addressed to the consenting owner'
);

-- ---------------------------------------------------------------------------
-- Voiding removes the reason (5)
-- ---------------------------------------------------------------------------

select public.void_visit('ef000000-0000-0000-0000-000000000001', 'Recorded against the wrong animal');

-- 5
select is(
  (select status from public.client_reminders where visit_id = 'ef000000-0000-0000-0000-000000000001'),
  'cancelled',
  'Voiding the record cancels the reminder rather than leaving it to send'
);

-- ---------------------------------------------------------------------------
-- Consent is a gate, not an afterthought (6-7)
-- ---------------------------------------------------------------------------

select public.create_visit(
  p_id => 'ef000000-0000-0000-0000-000000000002',
  p_patient_id => 'df000000-0000-0000-0000-000000000002',
  p_visit_date => now(), p_visit_type => 'home_call'
);
select public.update_visit_draft(
  p_id => 'ef000000-0000-0000-0000-000000000002',
  p_visit_date => now(), p_visit_type => 'home_call',
  p_next_review_date => (current_date + 14)
);
select public.complete_visit('ef000000-0000-0000-0000-000000000002');

-- 6 Nothing is created at all, so there is no queue waiting on a permission
-- nobody gave.
select is(
  (select count(*)::int from public.client_reminders where visit_id = 'ef000000-0000-0000-0000-000000000002'),
  0,
  'A client who never consented has nothing queued about them'
);

-- 7 Checked as the owner: authenticated deliberately holds no EXECUTE on this
-- helper, so asserting it through that role would only prove the grant.
reset role;

select is(
  (select app_private.reminder_recipient('df000000-0000-0000-0000-000000000002')),
  null,
  'There is no recipient without consent'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'af000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"af000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

-- ---------------------------------------------------------------------------
-- Preventive care and withholding (8-11)
-- ---------------------------------------------------------------------------

select public.record_preventive_care(
  p_id => '5f000000-0000-0000-0000-000000000001',
  p_patient_id => 'df000000-0000-0000-0000-000000000001',
  p_kind => 'vaccination', p_vaccine_type => 'anthrax',
  p_product_name => 'Anthrax vaccine', p_date_given => current_date,
  p_next_due_date => (current_date + 365), p_route => 'sc'
);

-- 8
select is(
  (select reminder_type from public.client_reminders
   where preventive_care_id = '5f000000-0000-0000-0000-000000000001'),
  'vaccination_due',
  'A vaccination due date queues a reminder'
);

-- 9 A dose due on Friday is no use announced on Friday.
select is(
  (select send_at::date from public.client_reminders
   where preventive_care_id = '5f000000-0000-0000-0000-000000000001'),
  (current_date + 358),
  'It is sent a week ahead of the due date'
);

select public.create_visit(
  p_id => 'ef000000-0000-0000-0000-000000000003',
  p_patient_id => 'df000000-0000-0000-0000-000000000001',
  p_visit_date => now(), p_visit_type => 'field_visit'
);
select public.record_treatment(
  p_id => '6f000000-0000-0000-0000-000000000001',
  p_visit_id => 'ef000000-0000-0000-0000-000000000003',
  p_product_name => 'Oxytetracycline', p_dose_value => 20, p_dose_unit => 'ml',
  p_route => 'im',
  p_milk_withhold_until => (current_date + 7),
  p_meat_withhold_until => (current_date + 28)
);

-- 10 The longest governs: the animal is not clear until the last one passes.
select is(
  (select send_at::date from public.client_reminders
   where treatment_id = '6f000000-0000-0000-0000-000000000001'),
  (current_date + 28),
  'Withholding is announced when the longest period ends, not the first'
);

-- 11
select is(
  (select reminder_type from public.client_reminders
   where treatment_id = '6f000000-0000-0000-0000-000000000001'),
  'withdrawal_ends',
  'It is a withdrawal reminder, the one with a food-safety consequence'
);

-- ---------------------------------------------------------------------------
-- Saving twice does not send twice (12-13)
-- ---------------------------------------------------------------------------

select public.update_preventive_care(
  p_id => '5f000000-0000-0000-0000-000000000001',
  p_product_name => 'Anthrax vaccine',
  p_date_given => current_date,
  p_vaccine_type => 'anthrax',
  p_next_due_date => (current_date + 400)
);

-- 12
select is(
  (select count(*)::int from public.client_reminders
   where preventive_care_id = '5f000000-0000-0000-0000-000000000001'),
  1,
  'Correcting the entry re-aims the reminder rather than queueing a second'
);

-- 13
select is(
  (select send_at::date from public.client_reminders
   where preventive_care_id = '5f000000-0000-0000-0000-000000000001'),
  (current_date + 393),
  'And the new due date is the one it will be sent for'
);

-- ---------------------------------------------------------------------------
-- Withdrawing consent withdraws the messages (14)
-- ---------------------------------------------------------------------------

select public.update_client(
  p_id => 'cf000000-0000-0000-0000-000000000001',
  p_name => 'Consenting Client',
  p_phone_display => '024 396 0011',
  p_phone_e164 => '+233243960011',
  p_communication_consent => false
);

-- 14 Consent is not only a gate at creation.
select is(
  (select count(*)::int from public.client_reminders
   where patient_id = 'df000000-0000-0000-0000-000000000001' and status = 'queued'),
  0,
  'Turning reminders off cancels the ones already queued'
);

-- ---------------------------------------------------------------------------
-- What the vet can do today (15-16)
-- ---------------------------------------------------------------------------

-- 15 Nothing sends yet, so everything sits at queued. That is the honest state.
select ok(
  not exists (select 1 from public.client_reminders where status in ('sent', 'delivered', 'read')),
  'Nothing is marked sent, because nothing sends until there is a provider'
);

-- 16 Exactly one target per reminder. Asserted as the owner: authenticated
-- holds no INSERT on this table, so through that role the grant refuses first
-- and the constraint is never reached.
reset role;

select throws_ok(
  $$insert into public.client_reminders
      (vet_id, reminder_type, visit_id, treatment_id, patient_id, send_at,
       template_key, recipient_e164, idempotency_key)
    values ('bf000000-0000-0000-0000-000000000001', 'follow_up',
       'ef000000-0000-0000-0000-000000000003', '6f000000-0000-0000-0000-000000000001',
       'df000000-0000-0000-0000-000000000001', now(), 'x', '+233243960011', 'two-targets')$$,
  '23514',
  null,
  'A reminder cannot point at two things at once'
);

reset role;

select * from finish();
rollback;
