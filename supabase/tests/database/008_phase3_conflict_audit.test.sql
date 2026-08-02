begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('a4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-conflict-a@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (
  id, auth_user_id, full_name, phone_display, phone_e164
) values
  ('b4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'Vet Conflict A', '0243400001', '+233243400001');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a4000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

-- 1
select lives_ok(
  $$select public.record_conflict_resolution(
      'visit', 'c4000000-0000-0000-0000-000000000001', 'combined',
      array['p_treatment_plan', 'p_chief_complaint']
    )$$,
  'A resolution can be recorded'
);
-- 2
select is(
  (select count(*)::integer from public.audit_events where action = 'sync.conflict_resolved'),
  1,
  'The resolution is written to the audit trail'
);
-- 3
select is(
  (select metadata ->> 'resolution' from public.audit_events where action = 'sync.conflict_resolved'),
  'combined',
  'The trail records which way the vet resolved it'
);
-- 4
select is(
  (select jsonb_array_length(metadata -> 'fields') from public.audit_events
    where action = 'sync.conflict_resolved'),
  2,
  'The trail records which fields were contested'
);
-- 5
select ok(
  (select metadata::text not like '%Limping%' from public.audit_events
    where action = 'sync.conflict_resolved'),
  'Only field names are stored, never the clinical text that was in dispute'
);
-- 6
select throws_ok(
  $$select public.record_conflict_resolution(
      'visit', 'c4000000-0000-0000-0000-000000000001', 'whatever', array['p_x']
    )$$,
  '22023',
  'Invalid conflict resolution',
  'An unrecognised resolution is refused'
);
-- 7
select throws_ok(
  $$select public.record_conflict_resolution(
      'visit', 'c4000000-0000-0000-0000-000000000001', 'keep_local',
      (select array_agg('f' || g) from generate_series(1, 60) g)
    )$$,
  '22023',
  'Too many fields in one resolution',
  'An implausibly large resolution is refused rather than bloating the trail'
);

-- Audit events stay append-only even for this new action.
-- 8
select throws_ok(
  $$update public.audit_events set action = 'tampered' where action = 'sync.conflict_resolved'$$,
  '42501',
  null,
  'A recorded resolution cannot be edited afterwards'
);

select set_config('request.jwt.claims', '{"sub":"a4000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
-- 9
select throws_ok(
  $$select public.record_conflict_resolution(
      'visit', 'c4000000-0000-0000-0000-000000000001', 'keep_local', array['p_x']
    )$$,
  '42501',
  'Multi-factor authentication required',
  'AAL1 cannot record a resolution'
);

reset role;

select * from finish();
rollback;
