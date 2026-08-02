begin;

create extension if not exists pgtap with schema extensions;
select plan(109);

-- ---------------------------------------------------------------------------
-- Fixtures. Identifier ranges 90000000-96000000 are reserved for this file so
-- they cannot collide with 001 (10000000/20000000/30000000) or 002
-- (40000000/50000000/60000000/70000000/80000000).
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('90000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-p2v-a@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('90000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-p2v-b@example.test', crypt('Strong-Test-Password-2!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (
  id, auth_user_id, full_name, phone_display, phone_e164
) values
  ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'Vet Visits A', '0241111111', '+233241111111'),
  ('91000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000002', 'Vet Visits B', '0242222222', '+233242222222');

insert into public.vet_devices (
  id, vet_id, device_name, platform, last_authenticated_at
) values
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'Vet A iPhone', 'ios', now()),
  ('92000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000002', 'Vet B Android', 'android', now());

insert into public.clients (
  id, vet_id, client_code, name, phone_display, phone_e164
) values
  ('93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'VK-C-AAA111', 'Client A', '024 000 0001', '+233240000001'),
  ('93000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000002', 'VK-C-BBB222', 'Client B', '024 000 0002', '+233240000002');

insert into public.patients (
  id, vet_id, patient_code, name, species, sex, deleted_at
) values
  ('94000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'VK-P-AAA111', 'Patient A', 'Dog', 'female', null),
  ('94000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000002', 'VK-P-BBB222', 'Patient B', 'Cat', 'male', null),
  ('94000000-0000-0000-0000-000000000003', '91000000-0000-0000-0000-000000000001', 'VK-P-AAA222', 'Patient A Removed', 'Goat', 'unknown', now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

-- ---------------------------------------------------------------------------
-- Vet A: creating a visit and its eleven-system examination checklist
-- ---------------------------------------------------------------------------

-- 1
select lives_ok(
  $$select public.create_visit(
      '95000000-0000-0000-0000-000000000001',
      '94000000-0000-0000-0000-000000000001',
      '2026-08-02 09:00:00+00'::timestamptz,
      'home_call',
      null::uuid,
      'Lethargy',
      '92000000-0000-0000-0000-000000000001'
    )$$,
  'Vet A can create a draft visit'
);
-- 2
select is((select count(*)::integer from public.visits), 1, 'Vet A sees exactly the visit they created');
-- 3
select is(
  (select count(*)::integer from public.physical_exam_findings
   where visit_id = '95000000-0000-0000-0000-000000000001'),
  11,
  'Creating a visit seeds exactly 11 physical examination rows'
);
-- 4
select is(
  (select count(*)::integer from public.physical_exam_findings
   where visit_id = '95000000-0000-0000-0000-000000000001' and status = 'not_examined'),
  11,
  'Every seeded examination system starts as not_examined'
);
-- 5
select is(
  (select count(*)::integer from public.physical_exam_findings
   where visit_id = '95000000-0000-0000-0000-000000000001' and status = 'normal'),
  0,
  'No examination system is ever defaulted to normal'
);
-- 6
select is(
  (select count(*)::integer from public.physical_exam_findings
   where visit_id = '95000000-0000-0000-0000-000000000001'
     and system_name in (
       'General', 'Cardiovascular', 'Respiratory', 'Gastrointestinal', 'Musculoskeletal',
       'Integumentary', 'Neurological', 'Ocular', 'Aural', 'Urogenital', 'Lymphatic'
     )),
  11,
  'The eleven seeded systems are exactly the eleven required body systems'
);
-- 7
select is(
  (select count(*)::integer from public.physical_exam_findings
   where visit_id = '95000000-0000-0000-0000-000000000001' and examined_at is null),
  11,
  'No seeded system carries an examination timestamp'
);

-- ---------------------------------------------------------------------------
-- Vet A: direct table mutation is denied on every new table
-- ---------------------------------------------------------------------------

-- 8
select throws_ok(
  $$insert into public.visits (id, vet_id, patient_id, visit_date, visit_type)
    values (
      gen_random_uuid(), '91000000-0000-0000-0000-000000000001',
      '94000000-0000-0000-0000-000000000001', now(), 'home_call'
    )$$,
  '42501',
  null,
  'Direct visit inserts are denied'
);
-- 9
select throws_ok(
  $$update public.visits set chief_complaint = 'Tampered'
    where id = '95000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'Direct visit updates are denied'
);
-- 10
select throws_ok(
  $$insert into public.physical_exam_findings (vet_id, visit_id, system_name)
    values (
      '91000000-0000-0000-0000-000000000001',
      '95000000-0000-0000-0000-000000000001',
      'General'
    )$$,
  '42501',
  null,
  'Direct examination finding inserts are denied'
);
-- 11
select throws_ok(
  $$update public.physical_exam_findings set status = 'normal'
    where visit_id = '95000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'Direct examination finding updates are denied'
);
-- 12
select throws_ok(
  $$insert into public.visit_amendments (id, vet_id, visit_id, reason, amendment_text)
    values (
      gen_random_uuid(), '91000000-0000-0000-0000-000000000001',
      '95000000-0000-0000-0000-000000000001', 'Illegal', 'Illegal amendment'
    )$$,
  '42501',
  null,
  'Direct amendment inserts are denied'
);

-- ---------------------------------------------------------------------------
-- Vet A: idempotent create and patient validation
-- ---------------------------------------------------------------------------

-- 13
select lives_ok(
  $$select public.create_visit(
      '95000000-0000-0000-0000-000000000001',
      '94000000-0000-0000-0000-000000000001',
      '2026-08-02 09:00:00+00'::timestamptz,
      'home_call',
      null::uuid,
      'Lethargy',
      '92000000-0000-0000-0000-000000000001'
    )$$,
  'Retrying create_visit with the same ID is idempotent'
);
-- 14
select is((select count(*)::integer from public.visits), 1, 'Idempotent retry does not create a duplicate visit');
-- 15
select is(
  (select count(*)::integer from public.physical_exam_findings
   where visit_id = '95000000-0000-0000-0000-000000000001'),
  11,
  'Idempotent retry does not duplicate the examination checklist'
);
-- 16
select throws_ok(
  $$select public.create_visit(
      gen_random_uuid(),
      '94000000-0000-0000-0000-000000000002',
      now(), 'clinic_visit'
    )$$,
  'P0002',
  'Patient not found',
  'create_visit rejects a patient owned by another vet'
);
-- 17
select throws_ok(
  $$select public.create_visit(
      gen_random_uuid(),
      '94000000-0000-0000-0000-000000000003',
      now(), 'clinic_visit'
    )$$,
  'P0002',
  'Patient not found',
  'create_visit rejects a soft-deleted patient'
);
-- 18
select throws_ok(
  $$select public.create_visit(
      gen_random_uuid(),
      '94000000-0000-0000-0000-000000000001',
      now(), 'not-a-visit-type'
    )$$,
  '22023',
  'Invalid visit type',
  'create_visit rejects an unknown visit type'
);

-- ---------------------------------------------------------------------------
-- Vet A: editing the draft
-- ---------------------------------------------------------------------------

-- 19
select lives_ok(
  $$select public.update_visit_draft(
      p_id => '95000000-0000-0000-0000-000000000001',
      p_visit_date => '2026-08-02 09:00:00+00'::timestamptz,
      p_visit_type => 'home_call',
      p_chief_complaint => 'Lethargy for two days',
      p_temperature_c => 38.6,
      p_heart_rate_bpm => 96,
      p_respiratory_rate_bpm => 24,
      p_weight_value => 12.40,
      p_weight_unit => 'kg',
      p_tentative_diagnosis => 'Suspected tick-borne disease',
      p_treatment_plan => 'Doxycycline course, review in five days',
      p_device_id => '92000000-0000-0000-0000-000000000001'
    )$$,
  'Vet A can update their own draft visit'
);
-- 20
select is(
  (select chief_complaint from public.visits where id = '95000000-0000-0000-0000-000000000001'),
  'Lethargy for two days',
  'Draft update is reflected'
);
-- 21
select ok(
  (select server_version from public.visits where id = '95000000-0000-0000-0000-000000000001') > 1,
  'Updating a draft visit increments server_version'
);
-- 22
select throws_ok(
  $$select public.update_visit_draft(
      p_id => '95000000-0000-0000-0000-000000000001',
      p_visit_date => '2026-08-02 09:00:00+00'::timestamptz,
      p_visit_type => 'home_call',
      p_temperature_c => 65.0
    )$$,
  '22023',
  'Invalid temperature reading',
  'update_visit_draft rejects an impossible temperature'
);

-- ---------------------------------------------------------------------------
-- Vet A: recording examination findings
-- ---------------------------------------------------------------------------

-- 23
select lives_ok(
  $$select public.set_exam_finding(
      '95000000-0000-0000-0000-000000000001',
      'Cardiovascular',
      'abnormal',
      'Grade II left apical murmur',
      '92000000-0000-0000-0000-000000000001'
    )$$,
  'Vet A can record an abnormal examination finding'
);
-- 24
select is(
  (select status from public.physical_exam_findings
   where visit_id = '95000000-0000-0000-0000-000000000001' and system_name = 'Cardiovascular'),
  'abnormal',
  'Recorded examination status is stored'
);
-- 25
select ok(
  (select examined_at is not null from public.physical_exam_findings
   where visit_id = '95000000-0000-0000-0000-000000000001' and system_name = 'Cardiovascular'),
  'Recording a finding stamps examined_at'
);
-- 26
select throws_ok(
  $$select public.set_exam_finding(
      '95000000-0000-0000-0000-000000000001', 'Endocrine', 'normal'
    )$$,
  '22023',
  'Invalid examination system',
  'set_exam_finding rejects a system outside the eleven-system checklist'
);
-- 27
select throws_ok(
  $$select public.set_exam_finding(
      '95000000-0000-0000-0000-000000000001', 'Ocular', 'looks-fine'
    )$$,
  '22023',
  'Invalid examination status',
  'set_exam_finding rejects an unknown status'
);

-- ---------------------------------------------------------------------------
-- Vet A: the deliberate "mark remaining systems normal" sweep
-- ---------------------------------------------------------------------------

-- 28
select lives_ok(
  $$select public.mark_remaining_systems_normal(
      '95000000-0000-0000-0000-000000000001',
      '92000000-0000-0000-0000-000000000001'
    )$$,
  'Vet A can deliberately mark the remaining systems normal'
);
-- 29
select is(
  (select count(*)::integer from public.physical_exam_findings
   where visit_id = '95000000-0000-0000-0000-000000000001' and status = 'normal'),
  10,
  'Only the ten untouched systems became normal'
);
-- 30
select is(
  (select status from public.physical_exam_findings
   where visit_id = '95000000-0000-0000-0000-000000000001' and system_name = 'Cardiovascular'),
  'abnormal',
  'mark_remaining_systems_normal never overwrites an existing finding'
);
-- 31
select is(
  (select count(*)::integer from public.physical_exam_findings
   where visit_id = '95000000-0000-0000-0000-000000000001' and status = 'not_examined'),
  0,
  'No system is left not_examined after the sweep'
);
-- 32
select is(
  (select public.mark_remaining_systems_normal(
     '95000000-0000-0000-0000-000000000001',
     '92000000-0000-0000-0000-000000000001'
   )),
  0,
  'A second sweep updates nothing'
);

-- ---------------------------------------------------------------------------
-- Vet A: completing the visit
-- ---------------------------------------------------------------------------

-- 33
select throws_ok(
  $$select public.create_visit_amendment(
      gen_random_uuid(),
      '95000000-0000-0000-0000-000000000001',
      'Premature amendment',
      'Trying to amend a draft'
    )$$,
  '42501',
  'Amendments are only allowed on a completed visit',
  'An amendment on a draft visit is rejected'
);
-- 34
select lives_ok(
  $$select public.complete_visit(
      '95000000-0000-0000-0000-000000000001',
      '92000000-0000-0000-0000-000000000001'
    )$$,
  'Vet A can complete a draft visit'
);
-- 35
select is(
  (select workflow_status from public.visits where id = '95000000-0000-0000-0000-000000000001'),
  'completed',
  'Completed visit carries the completed workflow status'
);
-- 36
select ok(
  (select signed_at is not null and completed_at is not null
   from public.visits where id = '95000000-0000-0000-0000-000000000001'),
  'Completion records both the signature and completion timestamps'
);
-- 37
select throws_ok(
  $$select public.update_visit_draft(
      p_id => '95000000-0000-0000-0000-000000000001',
      p_visit_date => '2026-08-02 09:00:00+00'::timestamptz,
      p_visit_type => 'home_call',
      p_chief_complaint => 'Rewritten history'
    )$$,
  '42501',
  'Only draft visits can be edited',
  'A completed visit rejects clinical edits through the draft RPC'
);
-- 38
select throws_ok(
  $$select public.set_exam_finding(
      '95000000-0000-0000-0000-000000000001', 'Ocular', 'normal'
    )$$,
  '42501',
  'Examination findings can only change while the visit is a draft',
  'Examination findings are locked once the visit is completed'
);
-- 39
select throws_ok(
  $$select public.mark_remaining_systems_normal('95000000-0000-0000-0000-000000000001')$$,
  '42501',
  'Examination findings can only change while the visit is a draft',
  'The normal sweep is unavailable once the visit is completed'
);

-- ---------------------------------------------------------------------------
-- Vet A: amendments
-- ---------------------------------------------------------------------------

-- 40
select lives_ok(
  $$select public.create_visit_amendment(
      '96000000-0000-0000-0000-000000000001',
      '95000000-0000-0000-0000-000000000001',
      'Correcting a transcription error',
      'Recorded weight should read 12.4 kg, not 12.0 kg.',
      '{"field":"weight_value"}'::jsonb,
      '92000000-0000-0000-0000-000000000001'
    )$$,
  'Vet A can amend a completed visit'
);
-- 41
select is(
  (select count(*)::integer from public.visit_amendments
   where visit_id = '95000000-0000-0000-0000-000000000001'),
  1,
  'Amendment is recorded against the completed visit'
);
-- 42
select lives_ok(
  $$select public.create_visit_amendment(
      '96000000-0000-0000-0000-000000000001',
      '95000000-0000-0000-0000-000000000001',
      'Correcting a transcription error',
      'Recorded weight should read 12.4 kg, not 12.0 kg.',
      '{"field":"weight_value"}'::jsonb,
      '92000000-0000-0000-0000-000000000001'
    )$$,
  'Retrying create_visit_amendment with the same ID is idempotent'
);
-- 43
select is(
  (select count(*)::integer from public.visit_amendments),
  1,
  'Idempotent retry does not duplicate the amendment'
);
-- 44
select throws_ok(
  $$update public.visit_amendments set amendment_text = 'Tampered'$$,
  '42501',
  null,
  'Amendments cannot be updated by a client role'
);
-- 45
select throws_ok(
  $$delete from public.visit_amendments$$,
  '42501',
  null,
  'Amendments cannot be deleted by a client role'
);
-- 46
select throws_ok(
  $$select public.create_visit_amendment(
      gen_random_uuid(),
      '95000000-0000-0000-0000-000000000001',
      '  ',
      'An amendment without a reason'
    )$$,
  '22023',
  'Amendment reason is required',
  'An amendment without a reason is rejected'
);
-- 47
select throws_ok(
  $$select public.create_visit_amendment(
      gen_random_uuid(),
      '95000000-0000-0000-0000-000000000001',
      'A perfectly good reason',
      '  '
    )$$,
  '22023',
  'Amendment text is required',
  'An empty amendment body is rejected'
);

-- ---------------------------------------------------------------------------
-- Vet A: voiding
-- ---------------------------------------------------------------------------

-- 48
select throws_ok(
  $$select public.void_visit('95000000-0000-0000-0000-000000000001', '')$$,
  '22023',
  'Void reason is required',
  'Voiding with a blank reason is rejected'
);
-- 49
select throws_ok(
  $$select public.void_visit('95000000-0000-0000-0000-000000000001', null::text)$$,
  '22023',
  'Void reason is required',
  'Voiding without a reason is rejected'
);
-- 50
select lives_ok(
  $$select public.create_visit(
      '95000000-0000-0000-0000-000000000002',
      '94000000-0000-0000-0000-000000000001',
      '2026-08-03 11:00:00+00'::timestamptz,
      'follow_up',
      null::uuid,
      'Vomiting since yesterday',
      '92000000-0000-0000-0000-000000000001'
    )$$,
  'Vet A can create a second visit'
);
-- 51
select lives_ok(
  $$select public.complete_visit(
      '95000000-0000-0000-0000-000000000002',
      '92000000-0000-0000-0000-000000000001'
    )$$,
  'Vet A can complete the second visit'
);
-- 52
select lives_ok(
  $$select public.void_visit(
      '95000000-0000-0000-0000-000000000001',
      'Recorded against the wrong patient',
      '92000000-0000-0000-0000-000000000001'
    )$$,
  'Vet A can void a completed visit with a reason'
);
-- 53
select is(
  (select workflow_status from public.visits where id = '95000000-0000-0000-0000-000000000001'),
  'voided',
  'Voided visit carries the voided workflow status'
);
-- 54
select is(
  (select void_reason from public.visits where id = '95000000-0000-0000-0000-000000000001'),
  'Recorded against the wrong patient',
  'The mandatory void reason is stored'
);
-- 55
select throws_ok(
  $$select public.complete_visit('95000000-0000-0000-0000-000000000001')$$,
  '42501',
  'Only draft visits can be completed',
  'A voided visit cannot be reopened by completing it again'
);
-- 56
select throws_ok(
  $$select public.create_visit_amendment(
      gen_random_uuid(),
      '95000000-0000-0000-0000-000000000001',
      'Late correction',
      'Trying to amend a voided visit'
    )$$,
  '42501',
  'Amendments are only allowed on a completed visit',
  'A voided visit cannot be amended'
);
-- 57
select is(
  (select count(*)::integer from public.audit_events where action = 'visit.voided'),
  1,
  'Voiding a visit writes an audit event'
);

-- ---------------------------------------------------------------------------
-- Vet B: cross-tenant isolation
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}', true);

-- 58
select is((select count(*)::integer from public.visits), 0, 'Vet B cannot see Vet A visits');
-- 59
select is((select count(*)::integer from public.physical_exam_findings), 0, 'Vet B cannot see Vet A examination findings');
-- 60
select is((select count(*)::integer from public.visit_amendments), 0, 'Vet B cannot see Vet A amendments');
-- 61
select throws_ok(
  $$select public.set_exam_finding(
      '95000000-0000-0000-0000-000000000002', 'Ocular', 'normal'
    )$$,
  'P0002',
  'Visit not found',
  'Vet B cannot record findings on a Vet A visit'
);
-- 62
select throws_ok(
  $$select public.mark_remaining_systems_normal('95000000-0000-0000-0000-000000000002')$$,
  'P0002',
  'Visit not found',
  'Vet B cannot sweep a Vet A visit'
);
-- 63
select throws_ok(
  $$select public.complete_visit('95000000-0000-0000-0000-000000000002')$$,
  'P0002',
  'Visit not found',
  'Vet B cannot complete a Vet A visit'
);
-- 64
select throws_ok(
  $$select public.void_visit('95000000-0000-0000-0000-000000000002', 'Malicious void')$$,
  'P0002',
  'Visit not found',
  'Vet B cannot void a Vet A visit'
);
-- 65
select throws_ok(
  $$select public.create_visit_amendment(
      gen_random_uuid(),
      '95000000-0000-0000-0000-000000000002',
      'Malicious amendment',
      'Injected amendment text'
    )$$,
  'P0002',
  'Visit not found',
  'Vet B cannot amend a Vet A visit'
);
-- 66
select throws_ok(
  $$select public.update_visit_draft(
      p_id => '95000000-0000-0000-0000-000000000002',
      p_visit_date => now(),
      p_visit_type => 'home_call'
    )$$,
  'P0002',
  'Visit not found',
  'Vet B cannot edit a Vet A visit'
);
-- 67
select throws_ok(
  $$select public.create_visit(
      '95000000-0000-0000-0000-000000000002',
      '94000000-0000-0000-0000-000000000002',
      now(), 'home_call'
    )$$,
  '42501',
  'Visit ID is unavailable',
  'Vet B cannot claim a visit ID that already belongs to Vet A'
);
-- 68
select lives_ok(
  $$select public.create_visit(
      '95000000-0000-0000-0000-000000000003',
      '94000000-0000-0000-0000-000000000002',
      now(), 'clinic_visit'
    )$$,
  'Vet B can create their own visit'
);
-- 69
select is((select count(*)::integer from public.visits), 1, 'Vet B sees only their own visit');

-- ---------------------------------------------------------------------------
-- AAL1 sessions are refused everywhere
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);

-- 70
select throws_ok(
  $$select public.create_visit(
      gen_random_uuid(),
      '94000000-0000-0000-0000-000000000001',
      now(), 'home_call'
    )$$,
  '42501',
  'Multi-factor authentication required',
  'AAL1 sessions cannot create a visit'
);
-- 71
select throws_ok(
  $$select public.complete_visit('95000000-0000-0000-0000-000000000002')$$,
  '42501',
  'Multi-factor authentication required',
  'AAL1 sessions cannot complete a visit'
);
-- 72
select throws_ok(
  $$select public.mark_remaining_systems_normal('95000000-0000-0000-0000-000000000002')$$,
  '42501',
  'Multi-factor authentication required',
  'AAL1 sessions cannot sweep examination systems'
);
-- 73
select is((select count(*)::integer from public.visits), 0, 'AAL1 sessions cannot read visits');
-- 74
select is((select count(*)::integer from public.physical_exam_findings), 0, 'AAL1 sessions cannot read examination findings');
-- 75
select is((select count(*)::integer from public.visit_amendments), 0, 'AAL1 sessions cannot read amendments');

reset role;

-- ---------------------------------------------------------------------------
-- Table-level guarantees, checked as the table owner so that the triggers
-- themselves are exercised rather than the GRANT layer.
-- Visit 95..001 is voided, visit 95..002 is completed.
-- ---------------------------------------------------------------------------

-- 76
select throws_ok(
  $$update public.visits set chief_complaint = 'Tampered'
    where id = '95000000-0000-0000-0000-000000000002'$$,
  '42501',
  'Clinical content of a visit that has left draft cannot be changed',
  'A completed visit rejects clinical edits at the table level'
);
-- 77
select throws_ok(
  $$update public.visits set workflow_status = 'draft'
    where id = '95000000-0000-0000-0000-000000000001'$$,
  '42501',
  'A voided visit cannot be reopened',
  'A voided visit can never be reopened'
);
-- 78
select throws_ok(
  $$update public.visits set workflow_status = 'draft'
    where id = '95000000-0000-0000-0000-000000000002'$$,
  '42501',
  'A completed visit cannot be reopened',
  'A completed visit can never be reopened'
);
-- 79
select throws_ok(
  $$update public.visits set deleted_at = now()
    where id = '95000000-0000-0000-0000-000000000002'$$,
  '42501',
  'A visit that has left draft cannot be deleted',
  'A completed visit cannot be soft-deleted'
);
-- 80
select throws_ok(
  $$delete from public.visits where id = '95000000-0000-0000-0000-000000000002'$$,
  '42501',
  'A visit that has left draft cannot be deleted',
  'A completed visit cannot be hard-deleted'
);
-- 81
select lives_ok(
  $$update public.visits set last_modified_by_device_id = null
    where id = '95000000-0000-0000-0000-000000000002'$$,
  'Non-clinical bookkeeping columns of a completed visit stay writable'
);
-- 82
select throws_ok(
  $$update public.physical_exam_findings set status = 'normal', examined_at = now()
    where visit_id = '95000000-0000-0000-0000-000000000002'$$,
  '42501',
  'Examination findings can only change while the visit is a draft',
  'Examination findings of a completed visit are locked at the table level'
);
-- 83
select throws_ok(
  $$delete from public.physical_exam_findings
    where visit_id = '95000000-0000-0000-0000-000000000002'$$,
  '42501',
  'Examination findings can only change while the visit is a draft',
  'Examination findings of a completed visit cannot be deleted'
);
-- 84
select throws_ok(
  $$update public.visit_amendments set amendment_text = 'Tampered'$$,
  '42501',
  'visit_amendments is append-only',
  'Amendments cannot be updated even by the table owner'
);
-- 85
select throws_ok(
  $$delete from public.visit_amendments$$,
  '42501',
  'visit_amendments is append-only',
  'Amendments cannot be deleted even by the table owner'
);
-- 86
select throws_ok(
  $$insert into public.visit_amendments (id, vet_id, visit_id, reason, amendment_text)
    values (
      gen_random_uuid(),
      '91000000-0000-0000-0000-000000000002',
      '95000000-0000-0000-0000-000000000002',
      'Cross tenant',
      'Amendment written against another tenant visit'
    )$$,
  '42501',
  'Child record tenant does not match the parent visit',
  'An amendment whose vet_id differs from its parent visit is rejected'
);
-- 87
select throws_ok(
  $$insert into public.physical_exam_findings (vet_id, visit_id, system_name)
    values (
      '91000000-0000-0000-0000-000000000002',
      '95000000-0000-0000-0000-000000000002',
      'General'
    )$$,
  '42501',
  'Child record tenant does not match the parent visit',
  'An examination finding whose vet_id differs from its parent visit is rejected'
);
-- 88
select throws_ok(
  $$insert into public.visits (id, vet_id, patient_id, visit_date, visit_type)
    values (
      gen_random_uuid(),
      '91000000-0000-0000-0000-000000000002',
      '94000000-0000-0000-0000-000000000001',
      now(), 'home_call'
    )$$,
  '42501',
  'Visit tenant does not match the patient tenant',
  'A visit whose vet_id differs from its patient is rejected'
);

-- ---------------------------------------------------------------------------
-- Table and function privileges
-- ---------------------------------------------------------------------------

-- 89
select ok(not has_table_privilege('anon', 'public.visits', 'SELECT'), 'Anonymous role cannot read visits');
-- 90
select ok(not has_table_privilege('anon', 'public.physical_exam_findings', 'SELECT'), 'Anonymous role cannot read examination findings');
-- 91
select ok(not has_table_privilege('anon', 'public.visit_amendments', 'SELECT'), 'Anonymous role cannot read amendments');
-- 92
select ok(has_table_privilege('authenticated', 'public.visits', 'SELECT'), 'Authenticated role can read visits through RLS');
-- 93
select ok(not has_table_privilege('authenticated', 'public.visits', 'INSERT'), 'Authenticated role has no INSERT on visits');
-- 94
select ok(not has_table_privilege('authenticated', 'public.visits', 'UPDATE'), 'Authenticated role has no UPDATE on visits');
-- 95
select ok(not has_table_privilege('authenticated', 'public.visits', 'DELETE'), 'Authenticated role has no DELETE on visits');
-- 96
select ok(not has_table_privilege('authenticated', 'public.physical_exam_findings', 'UPDATE'), 'Authenticated role has no UPDATE on examination findings');
-- 97
select ok(not has_table_privilege('authenticated', 'public.visit_amendments', 'INSERT'), 'Authenticated role has no INSERT on amendments');
-- 98
select ok(
  not has_function_privilege(
    'anon',
    'public.create_visit(uuid,uuid,timestamp with time zone,text,uuid,text,uuid)',
    'EXECUTE'
  ),
  'Anonymous role cannot execute create_visit'
);
-- 99
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_visit(uuid,uuid,timestamp with time zone,text,uuid,text,uuid)',
    'EXECUTE'
  ),
  'Authenticated role can execute create_visit'
);
-- 100
select ok(
  not has_function_privilege('anon', 'public.complete_visit(uuid,uuid)', 'EXECUTE'),
  'Anonymous role cannot execute complete_visit'
);
-- 101
select ok(
  has_function_privilege('authenticated', 'public.complete_visit(uuid,uuid)', 'EXECUTE'),
  'Authenticated role can execute complete_visit'
);
-- 102
select ok(
  not has_function_privilege('anon', 'public.void_visit(uuid,text,uuid)', 'EXECUTE'),
  'Anonymous role cannot execute void_visit'
);
-- 103
select ok(
  has_function_privilege('authenticated', 'public.void_visit(uuid,text,uuid)', 'EXECUTE'),
  'Authenticated role can execute void_visit'
);
-- 104
select ok(
  not has_function_privilege('anon', 'public.set_exam_finding(uuid,text,text,text,uuid,bigint)', 'EXECUTE'),
  'Anonymous role cannot execute set_exam_finding'
);
-- 105
select ok(
  has_function_privilege('authenticated', 'public.set_exam_finding(uuid,text,text,text,uuid,bigint)', 'EXECUTE'),
  'Authenticated role can execute set_exam_finding'
);
-- 106
select ok(
  not has_function_privilege('anon', 'public.mark_remaining_systems_normal(uuid,uuid)', 'EXECUTE'),
  'Anonymous role cannot execute mark_remaining_systems_normal'
);
-- 107
select ok(
  has_function_privilege('authenticated', 'public.mark_remaining_systems_normal(uuid,uuid)', 'EXECUTE'),
  'Authenticated role can execute mark_remaining_systems_normal'
);
-- 108
select ok(
  not has_function_privilege('anon', 'public.create_visit_amendment(uuid,uuid,text,text,jsonb,uuid)', 'EXECUTE'),
  'Anonymous role cannot execute create_visit_amendment'
);
-- 109
select ok(
  has_function_privilege('authenticated', 'public.create_visit_amendment(uuid,uuid,text,text,jsonb,uuid)', 'EXECUTE'),
  'Authenticated role can execute create_visit_amendment'
);

select * from finish();
rollback;
