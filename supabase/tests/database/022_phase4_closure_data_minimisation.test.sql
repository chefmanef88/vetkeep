begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

-- A veterinarian with every optional field filled in, so that clearing them is
-- observable rather than vacuously true.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('aa000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-min-a@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (
  id, auth_user_id, full_name, license_number,
  phone_display, phone_e164, whatsapp_display, whatsapp_e164,
  business_name, service_areas
) values (
  'ba000000-0000-0000-0000-0000000000d1', 'aa000000-0000-0000-0000-0000000000d1',
  'Vet Minimise', 'VCG-4471',
  '0243910041', '+233243910041', '024 391 0041', '+233243910041',
  'Minimise Veterinary Services', array['Adenta', 'Madina']
);

insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
  ('5e000000-0000-0000-0000-0000000000d1', 'aa000000-0000-0000-0000-0000000000d1', now(), now(), 'aal2');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa000000-0000-0000-0000-0000000000d1', true);
select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-0000000000d1","role":"authenticated","aal":"aal2","session_id":"5e000000-0000-0000-0000-0000000000d1"}', true);

select public.create_client(
  'ca000000-0000-0000-0000-0000000000d1', 'VK-C-MN0001', 'Retained Client',
  '024 391 0042', '+233243910042'
);
select public.create_patient(
  p_id => 'da000000-0000-0000-0000-0000000000d1',
  p_patient_code => 'VK-P-MN0001', p_name => 'Bruno',
  p_species => 'dog', p_sex => 'male'
);
select public.create_visit(
  p_id => 'ea000000-0000-0000-0000-0000000000d1',
  p_patient_id => 'da000000-0000-0000-0000-0000000000d1',
  p_visit_date => now(), p_visit_type => 'home_call'
);

select public.close_vet_account('CLOSE MY ACCOUNT', 'Retiring');

-- ---------------------------------------------------------------------------
-- What is kept: enough to attribute a signed record to a person (1-2)
-- ---------------------------------------------------------------------------

-- 1 A signature attributable to nobody is worth nothing, which is the whole
-- reason signed records are immutable in the first place.
select is(
  (select full_name from public.vets where id = 'ba000000-0000-0000-0000-0000000000d1'),
  'Vet Minimise',
  'The name on the records is kept, so a signed record still has a signer'
);

-- 2 How a regulator identifies the person who signed.
select is(
  (select license_number from public.vets where id = 'ba000000-0000-0000-0000-0000000000d1'),
  'VCG-4471',
  'The licence number is kept'
);

-- ---------------------------------------------------------------------------
-- What goes: everything that only served to contact someone who has left (3-7)
-- ---------------------------------------------------------------------------

-- 3
select ok(
  (select phone_display is null from public.vets where id = 'ba000000-0000-0000-0000-0000000000d1'),
  'The telephone number is cleared'
);

-- 4
select ok(
  (select phone_e164 is null from public.vets where id = 'ba000000-0000-0000-0000-0000000000d1'),
  'The dialling number is cleared'
);

-- 5
select ok(
  (select whatsapp_display is null and whatsapp_e164 is null
   from public.vets where id = 'ba000000-0000-0000-0000-0000000000d1'),
  'The WhatsApp number is cleared'
);

-- 6
select ok(
  (select business_name is null from public.vets where id = 'ba000000-0000-0000-0000-0000000000d1'),
  'The business name is cleared'
);

-- 7
select is(
  (select cardinality(service_areas) from public.vets where id = 'ba000000-0000-0000-0000-0000000000d1'),
  0,
  'The service areas are cleared'
);

-- ---------------------------------------------------------------------------
-- The erasure is itself a fact on the record (8)
-- ---------------------------------------------------------------------------

-- 8 Someone may later have to evidence that the details were removed at closure
-- rather than lost at some unknown point.
select is(
  (select (metadata ->> 'contact_details_cleared')::boolean
   from public.audit_events
   where vet_id = 'ba000000-0000-0000-0000-0000000000d1' and action = 'account.closed'),
  true,
  'The audit entry records that the contact details were cleared'
);

-- ---------------------------------------------------------------------------
-- Clearing contact does not touch the clinical record (9)
-- ---------------------------------------------------------------------------

-- 9 The records are the thing being deliberately retained. Minimising contact
-- must not quietly take them with it.
select is(
  (select count(*)::int from public.visits
   where vet_id = 'ba000000-0000-0000-0000-0000000000d1' and deleted_at is null),
  1,
  'The clinical record is still there'
);

-- ---------------------------------------------------------------------------
-- An account still in use cannot lose its contact details (10)
-- ---------------------------------------------------------------------------

-- Owner, because this is the table constraint being tested rather than any
-- policy or grant in front of it.
reset role;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('aa000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-min-b@example.test', crypt('Strong-Test-Password-2!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (id, auth_user_id, full_name, phone_display, phone_e164) values
  ('ba000000-0000-0000-0000-0000000000d2', 'aa000000-0000-0000-0000-0000000000d2', 'Vet Active', '0243910043', '+233243910043');

-- 10 Nullable was widened for closure alone. An account someone is still using
-- must have a way to reach them.
select throws_ok(
  $$update public.vets
    set phone_display = null, phone_e164 = null
    where id = 'ba000000-0000-0000-0000-0000000000d2'$$,
  '23514',
  null,
  'An active account cannot have its contact details removed'
);

select * from finish();
rollback;
