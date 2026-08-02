begin;

create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-p2-a@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-p2-b@example.test', crypt('Strong-Test-Password-2!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (
  id, auth_user_id, full_name, phone_display, phone_e164
) values
  ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Vet P2 A', '0241111111', '+233241111111'),
  ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'Vet P2 B', '0242222222', '+233242222222');

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

select lives_ok(
  $$select public.create_client(
      '60000000-0000-0000-0000-000000000001', 'VK-C-ABC123', 'Client One',
      '024 000 0001', '+233240000001'
    )$$,
  'Vet A can create a client'
);
select is((select count(*)::integer from public.clients), 1, 'Vet A sees exactly the client they created');

select throws_ok(
  $$insert into public.clients (id, vet_id, client_code, name, phone_display, phone_e164)
    values (gen_random_uuid(), '50000000-0000-0000-0000-000000000001', 'VK-C-ZZZ999', 'Illegal', '0240000000', '+233240000000')$$,
  '42501',
  null,
  'Direct client inserts are denied'
);
select throws_ok(
  $$update public.clients set name = 'Tampered' where id = '60000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'Direct client updates are denied'
);

select lives_ok(
  $$select public.create_client(
      '60000000-0000-0000-0000-000000000001', 'VK-C-ABC123', 'Client One',
      '024 000 0001', '+233240000001'
    )$$,
  'Retrying create_client with the same ID is idempotent'
);
select is((select count(*)::integer from public.clients), 1, 'Idempotent retry does not create a duplicate client');

select throws_ok(
  $$select public.create_client(
      gen_random_uuid(), 'VK-C-BAD001', 'Bad Phone Client', '024', 'not-e164'
    )$$,
  '22023',
  'Invalid E.164 phone number',
  'create_client rejects an invalid phone number'
);
select throws_ok(
  $$select public.create_client(
      gen_random_uuid(), 'not-a-code', 'Bad Code Client', '024 000 0002', '+233240000002'
    )$$,
  '22023',
  'Invalid client code format',
  'create_client rejects an invalid client code'
);

select lives_ok(
  $$select public.update_client(
      '60000000-0000-0000-0000-000000000001', 'Client One Renamed',
      '024 000 0001', '+233240000001'
    )$$,
  'Vet A can update their own client'
);
select is(
  (select name from public.clients where id = '60000000-0000-0000-0000-000000000001'),
  'Client One Renamed',
  'Client update is reflected'
);

select lives_ok(
  $$select public.create_patient(
      '70000000-0000-0000-0000-000000000001', 'VK-P-XYZ789', 'Patient One', 'Dog', 'female'
    )$$,
  'Vet A can create a patient'
);
select throws_ok(
  $$select public.create_patient(
      gen_random_uuid(), 'VK-P-BAD001', 'Bad Sex Patient', 'Cat', 'not-a-sex'
    )$$,
  '22023',
  'Invalid sex value',
  'create_patient rejects an invalid sex value'
);

select lives_ok(
  $$select public.create_patient_owner(
      '80000000-0000-0000-0000-000000000001',
      '70000000-0000-0000-0000-000000000001',
      '60000000-0000-0000-0000-000000000001',
      'owner', true
    )$$,
  'Vet A can link a patient to a client as primary owner'
);
select is(
  (select count(*)::integer from public.patient_owners
   where patient_id = '70000000-0000-0000-0000-000000000001' and is_primary = true and valid_to is null),
  1,
  'Patient has exactly one active primary owner'
);

select lives_ok(
  $$select public.create_client(
      '60000000-0000-0000-0000-000000000002', 'VK-C-DEF456', 'Client Two',
      '024 000 0003', '+233240000003'
    )$$,
  'Vet A can create a second client'
);
select lives_ok(
  $$select public.create_patient_owner(
      '80000000-0000-0000-0000-000000000002',
      '70000000-0000-0000-0000-000000000001',
      '60000000-0000-0000-0000-000000000002',
      'new owner', true
    )$$,
  'A new primary owner can be linked, transferring primary status'
);
select is(
  (select count(*)::integer from public.patient_owners
   where patient_id = '70000000-0000-0000-0000-000000000001' and is_primary = true and valid_to is null),
  1,
  'Still exactly one active primary owner after transfer'
);
select is(
  (select is_primary from public.patient_owners where id = '80000000-0000-0000-0000-000000000001'),
  false,
  'Original primary owner link was demoted, not deleted'
);

select lives_ok(
  $$select public.delete_client('60000000-0000-0000-0000-000000000002', 'Duplicate record')$$,
  'Vet A can soft-delete a client'
);
select is(
  (select deleted_at is not null from public.clients where id = '60000000-0000-0000-0000-000000000002'),
  true,
  'Soft-deleted client has deleted_at set'
);
select throws_ok(
  $$select public.create_patient_owner(
      gen_random_uuid(), '70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002'
    )$$,
  'P0002',
  'Client not found',
  'Soft-deleted clients cannot be linked as an owner'
);

select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"40000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}', true);

select is((select count(*)::integer from public.clients), 0, 'Vet B cannot see Vet A clients');
select lives_ok(
  $$select public.create_client(
      gen_random_uuid(), 'VK-C-GHJ789', 'Vet B Client', '024 000 0004', '+233240000004'
    )$$,
  'Vet B can create their own client'
);
select throws_ok(
  $$select public.create_patient_owner(
      gen_random_uuid(), '70000000-0000-0000-0000-000000000001',
      (select id from public.clients limit 1)
    )$$,
  'P0002',
  'Patient not found',
  'Vet B cannot link Vet A patient as an owner'
);

select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
select throws_ok(
  $$select public.create_client(
      gen_random_uuid(), 'VK-C-JKM012', 'AAL1 Client', '024 000 0005', '+233240000005'
    )$$,
  '42501',
  'Multi-factor authentication required',
  'AAL1 sessions cannot create a client'
);

reset role;

select ok(
  not has_function_privilege(
    'anon',
    'public.create_client(uuid,text,text,text,text,text,text,text,text,numeric,numeric,boolean,text,uuid)',
    'EXECUTE'
  ),
  'Anonymous role cannot execute create_client'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_client(uuid,text,text,text,text,text,text,text,text,numeric,numeric,boolean,text,uuid)',
    'EXECUTE'
  ),
  'Authenticated role can execute create_client'
);

select * from finish();
rollback;
