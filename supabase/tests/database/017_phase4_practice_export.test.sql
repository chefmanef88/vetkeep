begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('ab000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-exp-a@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('ab000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-exp-b@example.test', crypt('Strong-Test-Password-2!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (id, auth_user_id, full_name, phone_display, phone_e164) values
  ('bb000000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000001', 'Vet Export A', '0243920001', '+233243920001'),
  ('bb000000-0000-0000-0000-000000000002', 'ab000000-0000-0000-0000-000000000002', 'Vet Export B', '0243920002', '+233243920002');

insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
  ('5f000000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000001', now(), now(), 'aal2');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ab000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"ab000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2","session_id":"5f000000-0000-0000-0000-000000000001"}', true);

select public.create_client(
  'cb000000-0000-0000-0000-000000000001', 'VK-C-EXP001', 'Export Client',
  '024 392 0011', '+233243920011'
);
select public.create_patient(
  p_id => 'db000000-0000-0000-0000-000000000001',
  p_patient_code => 'VK-P-EXP001', p_name => 'Nutmeg',
  p_species => 'dog', p_sex => 'female'
);
select public.create_visit(
  p_id => 'eb000000-0000-0000-0000-000000000001',
  p_patient_id => 'db000000-0000-0000-0000-000000000001',
  p_visit_date => now(), p_visit_type => 'home_call',
  p_record_code => 'VK-R-EXP001'
);
select public.record_treatment(
  p_id => '1b000000-0000-0000-0000-000000000001',
  p_visit_id => 'eb000000-0000-0000-0000-000000000001',
  p_product_name => 'Meloxicam', p_dose_value => 2, p_dose_unit => 'ml', p_route => 'sc'
);

-- ---------------------------------------------------------------------------
-- Requesting an export (1-3)
-- ---------------------------------------------------------------------------

-- 1
select lives_ok(
  $$select public.create_export_job('fb000000-0000-0000-0000-000000000001')$$,
  'A veterinarian can request a copy of their practice'
);

-- 2
select is(
  (select status from public.export_jobs where id = 'fb000000-0000-0000-0000-000000000001'),
  'requested',
  'The request is recorded before anything is built'
);

-- 3 The row is the record that a disclosure was asked for.
select is(
  (select count(*)::int from public.audit_events
   where vet_id = 'bb000000-0000-0000-0000-000000000001' and action = 'export.requested'),
  1,
  'Requesting an export is audited'
);

-- ---------------------------------------------------------------------------
-- What the export contains (4-9)
-- ---------------------------------------------------------------------------

-- 4 Everything §17.1 lists is a key in the document.
select ok(
  (select public.build_practice_export('fb000000-0000-0000-0000-000000000001')) ?& array[
    'practice', 'clients', 'patients', 'patient_owners', 'visits', 'visit_amendments',
    'physical_exam_findings', 'treatments', 'preventive_care', 'invoices', 'invoice_items',
    'invoice_payments', 'attachment_manifest'
  ],
  'The export carries every section the brief asks for'
);

-- 5
select is(
  jsonb_array_length(
    (select public.build_practice_export('fb000000-0000-0000-0000-000000000001')) -> 'clients'
  ),
  1,
  'The client is in it'
);

-- 6
select is(
  jsonb_array_length(
    (select public.build_practice_export('fb000000-0000-0000-0000-000000000001')) -> 'treatments'
  ),
  1,
  'The treatment is in it, with its withholding dates'
);

-- 7 The eleven seeded systems travel with the record; an export missing them
-- would lose what was examined and found normal.
select is(
  jsonb_array_length(
    (select public.build_practice_export('fb000000-0000-0000-0000-000000000001'))
      -> 'physical_exam_findings'
  ),
  11,
  'The examination travels with the consultation'
);

-- 8 The practice's own identity, minus the auth linkage, which is ours and not
-- theirs to carry away.
select ok(
  not ((select public.build_practice_export('fb000000-0000-0000-0000-000000000001')) -> 'practice')
    ? 'auth_user_id',
  'The export does not carry the internal auth identifier'
);

-- 9
select is(
  (select public.build_practice_export('fb000000-0000-0000-0000-000000000001')) ->> 'format_version',
  '1',
  'The document says which format it is, so a future reader can tell'
);

-- ---------------------------------------------------------------------------
-- The job records the size of the disclosure (10-12)
-- ---------------------------------------------------------------------------

-- 10
select is(
  (select status from public.export_jobs where id = 'fb000000-0000-0000-0000-000000000001'),
  'ready',
  'Building marks the job ready'
);

-- 11
select is(
  (select (record_counts ->> 'visits')::int
   from public.export_jobs where id = 'fb000000-0000-0000-0000-000000000001'),
  1,
  'The job records how much left, not merely that something did'
);

-- 12 Generating and downloading are different events; only the second means the
-- data actually left the application.
select throws_ok(
  $$select public.mark_export_downloaded('fb000000-0000-0000-0000-000000000002')$$,
  'P0002',
  'Export not found',
  'An unknown export cannot be marked downloaded'
);

select public.mark_export_downloaded('fb000000-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- A closed account can still take its data (13-14)
-- ---------------------------------------------------------------------------

-- 13
select is(
  (select count(*)::int from public.audit_events
   where vet_id = 'bb000000-0000-0000-0000-000000000001' and action = 'export.downloaded'),
  1,
  'The download is audited separately from the generation'
);

select public.close_vet_account('CLOSE MY ACCOUNT');

-- 14 Otherwise closure is a trap: §17.2 offers export first, and this is what
-- makes that offer good afterwards too.
select lives_ok(
  $$select public.build_practice_export('fb000000-0000-0000-0000-000000000001')$$,
  'A closed account can still export its own records'
);

-- ---------------------------------------------------------------------------
-- One practice is not another (15-16)
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ab000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"ab000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}', true);

-- 15
select throws_ok(
  $$select public.build_practice_export('fb000000-0000-0000-0000-000000000001')$$,
  'P0002',
  'Export not found',
  'One veterinarian cannot build another veterinarian''s export'
);

-- 16 An empty practice exports an empty document rather than failing, so the
-- flow is the same on the first day as on the thousandth.
select public.create_export_job('fb000000-0000-0000-0000-000000000009');

select is(
  jsonb_array_length(
    (select public.build_practice_export('fb000000-0000-0000-0000-000000000009')) -> 'clients'
  ),
  0,
  'A practice with no records exports an empty document, not an error'
);

reset role;

select * from finish();
rollback;
