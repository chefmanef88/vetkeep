begin;

create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('a5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-att-a@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a5000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-att-b@example.test', crypt('Strong-Test-Password-2!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (
  id, auth_user_id, full_name, phone_display, phone_e164
) values
  ('b5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'Vet Att A', '0243500001', '+233243500001'),
  ('b5000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000002', 'Vet Att B', '0243500002', '+233243500002');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a5000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

select public.create_patient(
  p_id => 'c5000000-0000-0000-0000-000000000001',
  p_patient_code => 'VK-P-ATT001',
  p_name => 'Photo Patient',
  p_species => 'dog',
  p_sex => 'female'
);

-- ---------------------------------------------------------------------------
-- The bucket must be private (1)
-- ---------------------------------------------------------------------------

reset role;
-- 1
select is(
  (select public from storage.buckets where id = 'clinical-attachments'),
  false,
  'The clinical bucket is private, so a leaked path is not a readable URL'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a5000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

-- ---------------------------------------------------------------------------
-- Registration (2-9)
-- ---------------------------------------------------------------------------

-- 2
select lives_ok(
  $$select public.register_attachment(
      'd5000000-0000-0000-0000-000000000001', 'left stifle.jpg', 'image/jpeg', 480000,
      'photo', 'c5000000-0000-0000-0000-000000000001'
    )$$,
  'An attachment can be registered before its bytes exist anywhere but the phone'
);
-- 3
select is(
  (select split_part(storage_path, '/', 1) from public.attachments
    where id = 'd5000000-0000-0000-0000-000000000001'),
  'b5000000-0000-0000-0000-000000000001',
  'The storage path begins with the owning veterinarian'
);
-- 4
select is(
  (select storage_path from public.attachments where id = 'd5000000-0000-0000-0000-000000000001'),
  'b5000000-0000-0000-0000-000000000001/d5000000-0000-0000-0000-000000000001/left_stifle.jpg',
  'The filename is sanitised into the path rather than used raw'
);
-- 5
select is(
  (select upload_status from public.attachments where id = 'd5000000-0000-0000-0000-000000000001'),
  'pending',
  'A newly registered attachment is pending, not uploaded'
);
-- 6
select is(
  (select checksum_sha256 from public.attachments where id = 'd5000000-0000-0000-0000-000000000001'),
  null,
  'No checksum is claimed before the bytes have arrived'
);
-- 7
select is(
  (select public.register_attachment(
      'd5000000-0000-0000-0000-000000000001', 'left stifle.jpg', 'image/jpeg', 480000,
      'photo', 'c5000000-0000-0000-0000-000000000001'
    )),
  'b5000000-0000-0000-0000-000000000001/d5000000-0000-0000-0000-000000000001/left_stifle.jpg',
  'Retrying registration returns the same path so the device resumes one upload'
);
-- 8
select is(
  (select count(*)::integer from public.attachments),
  1,
  'A retried registration does not create a second attachment'
);
-- 9
select throws_ok(
  $$select public.register_attachment(
      gen_random_uuid(), 'orphan.jpg', 'image/jpeg', 100, 'photo'
    )$$,
  '22023',
  'An attachment must be filed against an animal or a visit',
  'An attachment belonging to nothing is refused'
);

-- ---------------------------------------------------------------------------
-- Upload lifecycle (10-16)
-- ---------------------------------------------------------------------------

-- 10
select lives_ok(
  $$select public.mark_attachment_uploading('d5000000-0000-0000-0000-000000000001')$$,
  'An attachment can be marked as uploading'
);
-- 11
select throws_ok(
  $$select public.confirm_attachment_upload('d5000000-0000-0000-0000-000000000001', 'not-a-checksum')$$,
  '22023',
  'A SHA-256 checksum is required to confirm an upload',
  'An upload cannot be confirmed without a real checksum'
);
-- 12
select is(
  (select upload_status from public.attachments where id = 'd5000000-0000-0000-0000-000000000001'),
  'uploading',
  'A refused confirmation leaves the attachment unconfirmed, so the phone keeps its copy'
);
-- 13
select lives_ok(
  $$select public.confirm_attachment_upload(
      'd5000000-0000-0000-0000-000000000001',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    )$$,
  'An upload is confirmed with a checksum'
);
-- 14
select ok(
  (select upload_status = 'uploaded' and uploaded_at is not null and checksum_sha256 is not null
   from public.attachments where id = 'd5000000-0000-0000-0000-000000000001'),
  'A confirmed upload records the checksum and the time together'
);
-- 15
select throws_ok(
  $$select public.mark_attachment_failed('d5000000-0000-0000-0000-000000000001', 'network died')$$,
  'P0002',
  'Attachment not found or already uploaded',
  'A confirmed upload cannot be marked failed afterwards'
);
-- 16
select throws_ok(
  $$select public.mark_attachment_uploading('d5000000-0000-0000-0000-000000000001')$$,
  'P0002',
  'Attachment not found or already uploaded',
  'A confirmed upload cannot be reopened for upload'
);

-- ---------------------------------------------------------------------------
-- Direct mutation is denied (17-18)
-- ---------------------------------------------------------------------------

-- 17
select throws_ok(
  $$insert into public.attachments (
      id, vet_id, patient_id, storage_path, original_filename, mime_type, size_bytes, attachment_type
    ) values (
      gen_random_uuid(), 'b5000000-0000-0000-0000-000000000001',
      'c5000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001/x/y.jpg',
      'y.jpg', 'image/jpeg', 10, 'photo'
    )$$,
  '42501',
  null,
  'Direct attachment inserts are denied'
);
-- 18
select throws_ok(
  $$update public.attachments set upload_status = 'uploaded'
    where id = 'd5000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'Direct attachment updates are denied'
);

-- ---------------------------------------------------------------------------
-- Storage isolation (19-23)
-- ---------------------------------------------------------------------------

-- Vet A owns one object under their own prefix.
reset role;
insert into storage.objects (bucket_id, name, owner_id)
values (
  'clinical-attachments',
  'b5000000-0000-0000-0000-000000000001/d5000000-0000-0000-0000-000000000001/left_stifle.jpg',
  'a5000000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a5000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

-- 19
select is(
  (select count(*)::integer from storage.objects where bucket_id = 'clinical-attachments'),
  1,
  'A veterinarian can see the files under their own prefix'
);

select set_config('request.jwt.claim.sub', 'a5000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"a5000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}', true);

-- 20
select is(
  (select count(*)::integer from storage.objects where bucket_id = 'clinical-attachments'),
  0,
  'Vet B cannot see Vet A clinical files, even knowing the bucket'
);
-- 21
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('clinical-attachments', 'b5000000-0000-0000-0000-000000000001/stolen/x.jpg')$$,
  '42501',
  null,
  'Vet B cannot write into Vet A folder'
);
-- 22
select is(
  (select count(*)::integer from public.attachments),
  0,
  'Vet B cannot see Vet A attachment records either'
);

select set_config('request.jwt.claim.sub', 'a5000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a5000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
-- 23
select is(
  (select count(*)::integer from storage.objects where bucket_id = 'clinical-attachments'),
  0,
  'An AAL1 session cannot read clinical files even as the owner'
);

reset role;

-- 24
select ok(
  not has_function_privilege(
    'anon',
    'public.register_attachment(uuid,text,text,bigint,text,uuid,uuid,timestamptz,uuid)',
    'EXECUTE'
  ),
  'Anonymous callers cannot register attachments'
);

select * from finish();
rollback;
