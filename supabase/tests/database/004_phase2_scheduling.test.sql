begin;

create extension if not exists pgtap with schema extensions;
select plan(87);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('90000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-sched-a@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('90000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-sched-b@example.test', crypt('Strong-Test-Password-2!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (
  id, auth_user_id, full_name, phone_display, phone_e164
) values
  ('a0000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'Vet Sched A', '0243000001', '+233243000001'),
  ('a0000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000002', 'Vet Sched B', '0243000002', '+233243000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

-- Fixtures for Vet A. These are exercised by 002_phase2_clients_patients.test.sql.
select public.create_client(
  'b0000000-0000-0000-0000-000000000001', 'VK-C-SCH001', 'Route Client A',
  '024 300 0011', '+233243000011', null, null, null, 'Adenta, Accra', 5.700000, -0.150000
);
select public.create_patient(
  p_id => 'b1000000-0000-0000-0000-000000000001',
  p_patient_code => 'VK-P-SCH001',
  p_name => 'Patient A',
  p_species => 'dog',
  p_sex => 'female'
);

-- ---------------------------------------------------------------------------
-- Appointment creation (assertions 1-11)
-- ---------------------------------------------------------------------------

-- 1
select lives_ok(
  $$select public.create_appointment(
      'c0000000-0000-0000-0000-000000000001', 'home_call',
      'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
      '2026-09-01 09:00:00+00', '2026-09-01 10:00:00+00',
      'Vaccination due'
    )$$,
  'Vet A can create a house-call appointment request'
);
-- 2
select is(
  (select status from public.appointments where id = 'c0000000-0000-0000-0000-000000000001'),
  'requested',
  'New appointments start in the requested state'
);
-- 3
select lives_ok(
  $$select public.create_appointment(
      'c0000000-0000-0000-0000-000000000002', 'emergency',
      null, null, null, null,
      'Dog hit by a car',
      'Spintex Road', null, null, null,
      'Kofi Mensah', '024 300 0099', '+233243000099'
    )$$,
  'An emergency appointment can be created without a scheduled time'
);
-- 4
select ok(
  (select scheduled_start is null
          and status = 'requested'
          and contact_phone_e164 = '+233243000099'
     from public.appointments
    where id = 'c0000000-0000-0000-0000-000000000002'),
  'An emergency appointment still records status and contact information'
);
-- 5
select throws_ok(
  $$select public.create_appointment(
      gen_random_uuid(), 'emergency'
    )$$,
  '22023',
  'Emergency appointments require contact information',
  'An emergency without a client or contact details is rejected'
);
-- 6
select throws_ok(
  $$select public.create_appointment(
      gen_random_uuid(), 'home_call',
      'b0000000-0000-0000-0000-000000000001'
    )$$,
  '22023',
  'A proposed start time is required',
  'A non-emergency appointment without a proposed time is rejected'
);
-- 7
select throws_ok(
  $$select public.create_appointment(
      gen_random_uuid(), 'not-a-type', null, null, '2026-09-01 09:00:00+00'
    )$$,
  '22023',
  'Invalid appointment type',
  'create_appointment rejects an unknown appointment type'
);
-- 8
select throws_ok(
  $$select public.create_appointment(
      gen_random_uuid(), 'home_call', null, null,
      '2026-09-01 11:00:00+00', '2026-09-01 10:00:00+00'
    )$$,
  '22023',
  'Scheduled end must be after scheduled start',
  'create_appointment rejects an inverted schedule window'
);
-- 9
select throws_ok(
  $$select public.create_appointment(
      gen_random_uuid(), 'home_call', null,
      '00000000-0000-0000-0000-0000000000ff',
      '2026-09-01 09:00:00+00'
    )$$,
  'P0002',
  'Patient not found',
  'create_appointment rejects an unknown patient'
);
-- 10
select lives_ok(
  $$select public.create_appointment(
      'c0000000-0000-0000-0000-000000000001', 'home_call',
      'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
      '2026-09-01 09:00:00+00', '2026-09-01 10:00:00+00',
      'Vaccination due'
    )$$,
  'Retrying create_appointment with the same ID is idempotent'
);
-- 11
select is(
  (select count(*)::integer from public.appointments),
  2,
  'Idempotent retry does not create a duplicate appointment'
);

-- ---------------------------------------------------------------------------
-- Direct table mutation is denied (assertions 12-15)
-- ---------------------------------------------------------------------------

-- 12
select throws_ok(
  $$insert into public.appointments (id, vet_id, appointment_type, scheduled_start)
    values (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'home_call', '2026-09-01 09:00:00+00')$$,
  '42501',
  null,
  'Direct appointment inserts are denied'
);
-- 13
select throws_ok(
  $$update public.appointments set status = 'completed'
     where id = 'c0000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'Direct appointment updates are denied'
);
-- 14
select throws_ok(
  $$insert into public.daily_routes (id, vet_id, route_date)
    values (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', '2026-09-01')$$,
  '42501',
  null,
  'Direct daily route inserts are denied'
);
-- 15
select throws_ok(
  $$insert into public.daily_route_stops (id, vet_id, route_id, appointment_id, sequence_number)
    values (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001',
            gen_random_uuid(), 'c0000000-0000-0000-0000-000000000001', 1)$$,
  '42501',
  null,
  'Direct route stop inserts are denied'
);

-- ---------------------------------------------------------------------------
-- Editing details (assertions 16-17)
-- ---------------------------------------------------------------------------

-- 16
select lives_ok(
  $$select public.update_appointment_details(
      'c0000000-0000-0000-0000-000000000001', 'home_call',
      '2026-09-01 09:30:00+00', '2026-09-01 10:30:00+00',
      'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
      'Vaccination and lameness check'
    )$$,
  'Vet A can edit an open appointment'
);
-- 17
select is(
  (select reason_for_visit from public.appointments where id = 'c0000000-0000-0000-0000-000000000001'),
  'Vaccination and lameness check',
  'Appointment detail edits are persisted'
);

-- ---------------------------------------------------------------------------
-- Status state machine (assertions 18-31)
-- ---------------------------------------------------------------------------

-- 18
select throws_ok(
  $$select public.transition_appointment_status(
      'c0000000-0000-0000-0000-000000000001', 'completed'
    )$$,
  '22023',
  'Appointment status transition is not allowed',
  'requested -> completed is rejected'
);
-- 19
select throws_ok(
  $$select public.transition_appointment_status(
      'c0000000-0000-0000-0000-000000000001', 'requested'
    )$$,
  '22023',
  'Appointment status transition is not allowed',
  'Re-transitioning to the same status is rejected'
);
-- 20
select throws_ok(
  $$select public.transition_appointment_status(
      'c0000000-0000-0000-0000-000000000002', 'declined'
    )$$,
  '22023',
  'A decline reason is required',
  'Declining without a reason is rejected'
);
-- 21
select lives_ok(
  $$select public.transition_appointment_status(
      'c0000000-0000-0000-0000-000000000002', 'declined', 'requested', 'Outside service area'
    )$$,
  'requested -> declined succeeds with a reason'
);
-- 22
select is(
  (select decline_reason from public.appointments where id = 'c0000000-0000-0000-0000-000000000002'),
  'Outside service area',
  'The decline reason is recorded'
);
-- 23
select throws_ok(
  $$select public.transition_appointment_status(
      'c0000000-0000-0000-0000-000000000002', 'confirmed', null, null, '2026-09-01 09:00:00+00'
    )$$,
  '22023',
  'Appointment status transition is not allowed',
  'A declined appointment cannot be transitioned again'
);
-- 24
select throws_ok(
  $$select public.update_appointment_details(
      'c0000000-0000-0000-0000-000000000002', 'emergency',
      null, null, null, null, null, null, null, null, null,
      'Kofi Mensah', '024 300 0099', '+233243000099'
    )$$,
  '22023',
  'Closed appointments cannot be edited',
  'A declined appointment can no longer be edited'
);
-- 25
select lives_ok(
  $$select public.transition_appointment_status(
      'c0000000-0000-0000-0000-000000000001', 'confirmed', 'requested'
    )$$,
  'requested -> confirmed succeeds'
);
-- 26
select is(
  (select status from public.appointments where id = 'c0000000-0000-0000-0000-000000000001'),
  'confirmed',
  'The appointment is now confirmed'
);
-- 27
select ok(
  (select confirmed_at is not null from public.appointments where id = 'c0000000-0000-0000-0000-000000000001'),
  'Confirming stamps confirmed_at'
);
-- 28
select is(
  (select count(*)::integer from public.audit_events
    where entity_type = 'appointment'
      and action = 'appointment.status_changed'
      and entity_id = 'c0000000-0000-0000-0000-000000000001'),
  1,
  'Confirming an appointment writes an audit event'
);
-- 29
select throws_ok(
  $$select public.transition_appointment_status(
      'c0000000-0000-0000-0000-000000000001', 'completed', 'requested'
    )$$,
  '22023',
  'Appointment status has changed on the server',
  'A stale transition replayed from an offline device is rejected'
);
-- 30
select throws_ok(
  $$select public.transition_appointment_status(
      'c0000000-0000-0000-0000-000000000001', 'cancelled'
    )$$,
  '22023',
  'A cancellation reason is required',
  'Cancelling without a reason is rejected'
);
-- 31
select throws_ok(
  $$select public.transition_appointment_status(
      'c0000000-0000-0000-0000-000000000001', 'requested'
    )$$,
  '22023',
  'Appointment status transition is not allowed',
  'confirmed -> requested is rejected'
);

-- Two more confirmed appointments to build a route from.
select public.create_appointment(
  'c0000000-0000-0000-0000-000000000003', 'follow_up',
  'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
  '2026-09-01 11:00:00+00', '2026-09-01 12:00:00+00', 'Suture removal'
);
select public.transition_appointment_status('c0000000-0000-0000-0000-000000000003', 'confirmed');
select public.create_appointment(
  'c0000000-0000-0000-0000-000000000004', 'home_call',
  'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
  '2026-09-01 13:00:00+00', '2026-09-01 14:00:00+00', 'Deworming'
);
select public.transition_appointment_status('c0000000-0000-0000-0000-000000000004', 'confirmed');

-- ---------------------------------------------------------------------------
-- Daily routes (assertions 32-36)
-- ---------------------------------------------------------------------------

-- 32
select lives_ok(
  $$select public.upsert_daily_route(
      'd0000000-0000-0000-0000-000000000001', '2026-09-01', 'East Legon loop'
    )$$,
  'Vet A can create a daily route'
);
-- 33
select is(
  (select count(*)::integer from public.daily_routes),
  1,
  'Vet A has exactly one route'
);
-- 34
select lives_ok(
  $$select public.upsert_daily_route(
      'd0000000-0000-0000-0000-000000000009', '2026-09-01', 'East Legon loop'
    )$$,
  'A second device upserting the same route date is accepted'
);
-- 35
select is(
  (select count(*)::integer from public.daily_routes),
  1,
  'One vet-day never produces two routes'
);
-- 36
select is(
  (select id from public.daily_routes),
  'd0000000-0000-0000-0000-000000000001'::uuid,
  'The route that already owns the date wins and its ID is returned'
);

-- ---------------------------------------------------------------------------
-- Route stops (assertions 37-44)
-- ---------------------------------------------------------------------------

-- 37
select lives_ok(
  $$select public.add_route_stop(
      'e0000000-0000-0000-0000-000000000001',
      'd0000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000001',
      1
    )$$,
  'Vet A can add the first stop to a route'
);
-- 38
select lives_ok(
  $$select public.add_route_stop(
      'e0000000-0000-0000-0000-000000000002',
      'd0000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000003'
    )$$,
  'A stop added without a sequence number is appended'
);
-- 39
select is(
  (select sequence_number from public.daily_route_stops where id = 'e0000000-0000-0000-0000-000000000002'),
  2,
  'The appended stop takes the next sequence number'
);
-- 40
select throws_ok(
  $$select public.add_route_stop(
      gen_random_uuid(),
      'd0000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000004',
      1
    )$$,
  '23505',
  'Route stop sequence number is already in use',
  'A duplicate sequence number on the same route is rejected'
);
-- 41
select lives_ok(
  $$select public.add_route_stop(
      'e0000000-0000-0000-0000-000000000003',
      'd0000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000004'
    )$$,
  'Vet A can add a third stop'
);
-- 42
select lives_ok(
  $$select public.add_route_stop(
      'e0000000-0000-0000-0000-000000000004',
      'd0000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000001'
    )$$,
  'Re-adding the same appointment returns the existing stop'
);
-- 43
select is(
  (select count(*)::integer from public.daily_route_stops),
  3,
  'An appointment is never stopped at twice on one route'
);
-- 44
select throws_ok(
  $$select public.add_route_stop(
      gen_random_uuid(),
      'd0000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000002'
    )$$,
  '22023',
  'Only open appointments can be added to a route',
  'A declined appointment cannot be routed'
);

-- ---------------------------------------------------------------------------
-- Manual reordering (assertions 45-55)
-- ---------------------------------------------------------------------------

-- 45
select lives_ok(
  $$select public.resequence_route_stops(
      'd0000000-0000-0000-0000-000000000001',
      array[
        'e0000000-0000-0000-0000-000000000003',
        'e0000000-0000-0000-0000-000000000002',
        'e0000000-0000-0000-0000-000000000001'
      ]::uuid[]
    )$$,
  'Vet A can manually reverse the stop order'
);
-- 46
select is(
  (select sequence_number from public.daily_route_stops where id = 'e0000000-0000-0000-0000-000000000003'),
  1,
  'The last stop moved to the front'
);
-- 47
select is(
  (select sequence_number from public.daily_route_stops where id = 'e0000000-0000-0000-0000-000000000001'),
  3,
  'The first stop moved to the back'
);
-- 48
select is(
  (select string_agg(sequence_number::text, ',' order by sequence_number)
     from public.daily_route_stops
    where route_id = 'd0000000-0000-0000-0000-000000000001'),
  '1,2,3',
  'Reordering preserves a contiguous unique sequence'
);
-- 49
select throws_ok(
  $$select public.resequence_route_stops(
      'd0000000-0000-0000-0000-000000000001',
      array[
        'e0000000-0000-0000-0000-000000000001',
        'e0000000-0000-0000-0000-000000000002'
      ]::uuid[]
    )$$,
  '22023',
  'The new order must contain every stop on the route',
  'A partial reorder is rejected'
);
-- 50
select throws_ok(
  $$select public.resequence_route_stops(
      'd0000000-0000-0000-0000-000000000001',
      array[
        'e0000000-0000-0000-0000-000000000001',
        'e0000000-0000-0000-0000-000000000001',
        'e0000000-0000-0000-0000-000000000002'
      ]::uuid[]
    )$$,
  '22023',
  'The new order must not repeat a stop',
  'A reorder that repeats a stop is rejected'
);
-- 51
select lives_ok(
  $$select public.resequence_route_stops(
      'd0000000-0000-0000-0000-000000000001',
      array[
        'e0000000-0000-0000-0000-000000000002',
        'e0000000-0000-0000-0000-000000000003',
        'e0000000-0000-0000-0000-000000000001'
      ]::uuid[],
      'nearest_neighbor'
    )$$,
  'Swapping two adjacent stops does not violate the sequence constraint'
);
-- 52
select is(
  (select sequence_number from public.daily_route_stops where id = 'e0000000-0000-0000-0000-000000000002'),
  1,
  'The swapped stop took first position'
);
-- 53
select is(
  (select sequence_number from public.daily_route_stops where id = 'e0000000-0000-0000-0000-000000000003'),
  2,
  'The other swapped stop took second position'
);
-- 54
select is(
  (select optimization_method from public.daily_routes where id = 'd0000000-0000-0000-0000-000000000001'),
  'nearest_neighbor',
  'The ordering method is recorded on the route'
);
-- 55
select ok(
  (select optimized from public.daily_routes where id = 'd0000000-0000-0000-0000-000000000001'),
  'A computed order marks the route as optimized'
);

-- ---------------------------------------------------------------------------
-- Removing stops (assertions 56-59)
-- ---------------------------------------------------------------------------

-- 56
select lives_ok(
  $$select public.remove_route_stop(
      'e0000000-0000-0000-0000-000000000003', 'Client rescheduled'
    )$$,
  'Vet A can remove a stop from the route'
);
-- 57
select is(
  (select count(*)::integer from public.daily_route_stops),
  2,
  'The removed stop is gone'
);
-- 58
select is(
  (select string_agg(sequence_number::text, ',' order by sequence_number)
     from public.daily_route_stops
    where route_id = 'd0000000-0000-0000-0000-000000000001'),
  '1,2',
  'Removing a stop closes the sequence gap'
);
-- 59
select throws_ok(
  $$select public.remove_route_stop('e0000000-0000-0000-0000-000000000003')$$,
  'P0002',
  'Route stop not found',
  'Removing an already removed stop reports not found'
);

-- ---------------------------------------------------------------------------
-- Cross-tenant isolation (assertions 60-70)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}', true);

select public.create_client(
  'b0000000-0000-0000-0000-000000000002', 'VK-C-SCH002', 'Route Client B',
  '024 300 0022', '+233243000022'
);
select public.create_patient(
  p_id => 'b1000000-0000-0000-0000-000000000002',
  p_patient_code => 'VK-P-SCH002',
  p_name => 'Patient B',
  p_species => 'cat',
  p_sex => 'male'
);

-- 60
select is(
  (select count(*)::integer from public.appointments),
  0,
  'Vet B cannot see Vet A appointments'
);
-- 61
select is(
  (select count(*)::integer from public.daily_routes),
  0,
  'Vet B cannot see Vet A routes'
);
-- 62
select is(
  (select count(*)::integer from public.daily_route_stops),
  0,
  'Vet B cannot see Vet A route stops'
);
-- 63
select throws_ok(
  $$select public.transition_appointment_status(
      'c0000000-0000-0000-0000-000000000001', 'completed'
    )$$,
  'P0002',
  'Appointment not found',
  'Vet B cannot transition a Vet A appointment'
);
-- 64
select throws_ok(
  $$select public.update_appointment_details(
      'c0000000-0000-0000-0000-000000000001', 'home_call', '2026-09-01 09:00:00+00'
    )$$,
  'P0002',
  'Appointment not found',
  'Vet B cannot edit a Vet A appointment'
);
-- 65
select lives_ok(
  $$select public.upsert_daily_route(
      'd0000000-0000-0000-0000-000000000002', '2026-09-01', 'Tema loop'
    )$$,
  'Vet B can hold their own route for the same date'
);
-- 66
select throws_ok(
  $$select public.add_route_stop(
      gen_random_uuid(),
      'd0000000-0000-0000-0000-000000000002',
      'c0000000-0000-0000-0000-000000000001'
    )$$,
  'P0002',
  'Appointment not found',
  'Vet B cannot add a Vet A appointment to their own route'
);
-- 67
select lives_ok(
  $$select public.create_appointment(
      'c0000000-0000-0000-0000-000000000005', 'home_call',
      'b0000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002',
      '2026-09-01 09:00:00+00', '2026-09-01 10:00:00+00', 'Vet B call'
    )$$,
  'Vet B can create their own appointment'
);
-- 68
select throws_ok(
  $$select public.add_route_stop(
      gen_random_uuid(),
      'd0000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000005'
    )$$,
  'P0002',
  'Route not found',
  'Vet B cannot add a stop to a Vet A route'
);
-- 69
select throws_ok(
  $$select public.resequence_route_stops(
      'd0000000-0000-0000-0000-000000000001',
      array['e0000000-0000-0000-0000-000000000001']::uuid[]
    )$$,
  'P0002',
  'Route not found',
  'Vet B cannot reorder a Vet A route'
);
-- 70
select throws_ok(
  $$select public.remove_route_stop('e0000000-0000-0000-0000-000000000001')$$,
  'P0002',
  'Route stop not found',
  'Vet B cannot remove a Vet A route stop'
);

-- ---------------------------------------------------------------------------
-- AAL1 sessions (assertions 71-75)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);

-- 71
select throws_ok(
  $$select public.create_appointment(
      gen_random_uuid(), 'home_call', null, null, '2026-09-02 09:00:00+00'
    )$$,
  '42501',
  'Multi-factor authentication required',
  'AAL1 sessions cannot create an appointment'
);
-- 72
select throws_ok(
  $$select public.transition_appointment_status(
      'c0000000-0000-0000-0000-000000000001', 'completed'
    )$$,
  '42501',
  'Multi-factor authentication required',
  'AAL1 sessions cannot transition an appointment'
);
-- 73
select throws_ok(
  $$select public.add_route_stop(
      gen_random_uuid(),
      'd0000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000001'
    )$$,
  '42501',
  'Multi-factor authentication required',
  'AAL1 sessions cannot add a route stop'
);
-- 74
select throws_ok(
  $$select public.resequence_route_stops(
      'd0000000-0000-0000-0000-000000000001',
      array['e0000000-0000-0000-0000-000000000001']::uuid[]
    )$$,
  '42501',
  'Multi-factor authentication required',
  'AAL1 sessions cannot reorder a route'
);
-- 75
select is(
  (select count(*)::integer from public.appointments),
  0,
  'AAL1 sessions cannot read appointments'
);

reset role;

-- ---------------------------------------------------------------------------
-- Grants and schema guarantees (assertions 76-82)
-- ---------------------------------------------------------------------------

-- 76
select ok(
  not has_function_privilege(
    'anon',
    'public.create_appointment(uuid,text,uuid,uuid,timestamptz,timestamptz,text,text,numeric,numeric,text,text,text,text,uuid)',
    'EXECUTE'
  ),
  'Anonymous role cannot execute create_appointment'
);
-- 77
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_appointment(uuid,text,uuid,uuid,timestamptz,timestamptz,text,text,numeric,numeric,text,text,text,text,uuid)',
    'EXECUTE'
  ),
  'Authenticated role can execute create_appointment'
);
-- 78
select ok(
  not has_function_privilege(
    'anon',
    'public.transition_appointment_status(uuid,text,text,text,timestamptz,timestamptz,uuid,uuid)',
    'EXECUTE'
  ),
  'Anonymous role cannot execute transition_appointment_status'
);
-- 79
select ok(
  not has_function_privilege(
    'anon',
    'public.resequence_route_stops(uuid,uuid[],text,uuid)',
    'EXECUTE'
  ),
  'Anonymous role cannot execute resequence_route_stops'
);
-- 80
select ok(
  exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.daily_routes'::regclass
       and contype = 'u'
       and conname = 'daily_routes_vet_date_key'
  ),
  'daily_routes enforces one route per vet per date'
);
-- 81
select ok(
  exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.daily_route_stops'::regclass
       and contype = 'u'
       and conname = 'daily_route_stops_route_appointment_key'
  ),
  'daily_route_stops enforces unique (route_id, appointment_id)'
);
-- 82
select ok(
  exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.daily_route_stops'::regclass
       and contype = 'u'
       and conname = 'daily_route_stops_route_sequence_key'
  ),
  'daily_route_stops enforces unique (route_id, sequence_number)'
);

-- ---------------------------------------------------------------------------
-- Reschedule cycle (assertions 83-87)
-- `rescheduled` is transient, not terminal: a moved appointment must be able to
-- return to `confirmed` once a new time is agreed, on the same row.
-- Earlier sections leave the session at aal1 and reset the role, so restore an
-- authenticated aal2 session for Vet A before exercising the RPCs.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

select public.create_appointment(
  'c0000000-0000-0000-0000-000000000009', 'home_call',
  'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
  '2026-09-05 09:00:00+00', '2026-09-05 10:00:00+00', 'Reschedule cycle'
);
select public.transition_appointment_status('c0000000-0000-0000-0000-000000000009', 'confirmed');

-- 83
select lives_ok(
  $$select public.transition_appointment_status(
      'c0000000-0000-0000-0000-000000000009', 'rescheduled', 'confirmed', null,
      '2026-09-06 09:00:00+00', '2026-09-06 10:00:00+00'
    )$$,
  'confirmed -> rescheduled succeeds when a new time is supplied'
);
-- 84
select throws_ok(
  $$select public.transition_appointment_status(
      'c0000000-0000-0000-0000-000000000009', 'completed'
    )$$,
  '22023',
  'Appointment status transition is not allowed',
  'rescheduled -> completed is rejected'
);
-- 85
select lives_ok(
  $$select public.transition_appointment_status(
      'c0000000-0000-0000-0000-000000000009', 'confirmed', 'rescheduled'
    )$$,
  'rescheduled -> confirmed succeeds, so a moved appointment is not stranded'
);
-- 86
select is(
  (select status from public.appointments where id = 'c0000000-0000-0000-0000-000000000009'),
  'confirmed',
  'The rescheduled appointment is confirmed again on the same row'
);
-- 87
select is(
  (select count(*)::integer from public.appointments
    where id = 'c0000000-0000-0000-0000-000000000009'),
  1,
  'Rescheduling did not create a second appointment row'
);

select * from finish();
rollback;
