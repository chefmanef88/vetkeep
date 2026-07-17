begin;

create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-a@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-b@example.test', crypt('Strong-Test-Password-2!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (
  id, auth_user_id, full_name, phone_display, phone_e164
) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Vet A', '0241111111', '+233241111111'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Vet B', '0242222222', '+233242222222');

insert into public.vet_devices (
  id, vet_id, device_name, platform, last_authenticated_at
) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Vet A iPhone', 'ios', now()),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Vet B Android', 'android', now());

select app_private.insert_audit_event(
  '20000000-0000-0000-0000-000000000001',
  'test.created',
  'vet_device',
  '30000000-0000-0000-0000-000000000001',
  null,
  '{}'::jsonb
);
select app_private.insert_audit_event(
  '20000000-0000-0000-0000-000000000002',
  'test.created',
  'vet_device',
  '30000000-0000-0000-0000-000000000002',
  null,
  '{}'::jsonb
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

select is((select count(*)::integer from public.vets), 1, 'Vet A sees only their profile');
select is((select full_name from public.vets limit 1), 'Vet A', 'Vet A cannot read Vet B profile');
select is((select count(*)::integer from public.vet_devices), 1, 'Vet A sees only their device');
select is((select count(*)::integer from public.audit_events), 1, 'Vet A sees only their audit events');
select throws_ok(
  $$insert into public.vet_devices (id, vet_id, device_name, platform, last_authenticated_at) values (gen_random_uuid(), '20000000-0000-0000-0000-000000000001', 'Illegal insert', 'ios', now())$$,
  '42501',
  null,
  'Direct device inserts are denied'
);
select throws_ok(
  $$update public.vets set license_verified = true where id = '20000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'Direct profile updates are denied'
);
select lives_ok(
  $$select public.register_current_device('30000000-0000-0000-0000-000000000003', 'Second device', 'ios', '0.1.0')$$,
  'Controlled device registration succeeds'
);
select is((select count(*)::integer from public.vet_devices), 2, 'Registered device is visible to Vet A');
select throws_ok(
  $$select public.revoke_current_device('30000000-0000-0000-0000-000000000002', 'Attempt cross-tenant revoke')$$,
  'P0002',
  'Device not found',
  'Vet A cannot revoke Vet B device'
);
select throws_ok(
  $$update public.audit_events set action = 'tampered'$$,
  '42501',
  null,
  'Audit events cannot be updated'
);
select throws_ok(
  $$delete from public.audit_events$$,
  '42501',
  null,
  'Audit events cannot be deleted'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
select is((select count(*)::integer from public.vets), 0, 'AAL1 cannot read private profile data');
select throws_ok(
  $$select public.register_current_device('30000000-0000-0000-0000-000000000004', 'AAL1 device', 'ios', '0.1.0')$$,
  '42501',
  'Multi-factor authentication required',
  'AAL1 cannot register a device'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}', true);
select is((select count(*)::integer from public.vets), 1, 'Vet B sees only their profile');
select is((select device_name from public.vet_devices limit 1), 'Vet B Android', 'Vet B cannot read Vet A devices');



reset role;

select ok(
  not has_function_privilege(
    'anon',
    'public.register_current_device(uuid,text,text,text)',
    'EXECUTE'
  ),
  'Anonymous role cannot execute device registration RPC'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.register_current_device(uuid,text,text,text)',
    'EXECUTE'
  ),
  'Authenticated role can execute controlled device registration RPC'
);

select throws_ok(
  $$insert into public.audit_events (vet_id, action, entity_type, metadata)
    values (
      '20000000-0000-0000-0000-000000000001',
      'test.oversized',
      'test',
      jsonb_build_object('payload', repeat('x', 9000))
    )$$,
  '23514',
  null,
  'Oversized audit metadata is rejected'
);

update public.vets
set license_number = 'VCG-001', license_verified = true
where id = '20000000-0000-0000-0000-000000000001';

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '10000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'vet-c@example.test',
  crypt('Strong-Test-Password-3!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

select throws_ok(
  $$insert into public.vets (
      id, auth_user_id, full_name, license_number, license_verified, phone_display, phone_e164
    ) values (
      '20000000-0000-0000-0000-000000000003',
      '10000000-0000-0000-0000-000000000003',
      'Duplicate Verified Vet',
      ' vcg-001 ',
      true,
      '0243333333',
      '+233243333333'
    )$$,
  '23505',
  null,
  'Verified licence numbers are unique after normalization'
);

update public.vets
set account_status = 'suspended'
where id = '20000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

select throws_ok(
  $$select public.update_vet_profile(
      'Vet A', '0241111111', '+233241111111', null, null, null, '{}'
    )$$,
  '42501',
  'Active veterinarian account required',
  'Suspended account cannot mutate its profile'
);

select lives_ok(
  $$select public.revoke_current_device(
      '30000000-0000-0000-0000-000000000003',
      'Lost device'
    )$$,
  'Suspended account can revoke a device for security containment'
);
select lives_ok(
  $$select public.revoke_current_device(
      '30000000-0000-0000-0000-000000000003',
      'Repeated lost-device request'
    )$$,
  'Device revocation is idempotent'
);

reset role;

select * from finish();
rollback;
