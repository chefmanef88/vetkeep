begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('a7000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-vid-a@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (
  id, auth_user_id, full_name, phone_display, phone_e164
) values
  ('b7000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000001', 'Vet Vid A', '0243700001', '+233243700001');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a7000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

select public.create_patient(
  p_id => 'c7000000-0000-0000-0000-000000000001',
  p_patient_code => 'VK-P-VD0001',
  p_name => 'Lame Heifer',
  p_species => 'cattle',
  p_sex => 'female'
);

-- ---------------------------------------------------------------------------
-- The bucket carries what a phone actually records (3)
-- ---------------------------------------------------------------------------

reset role;

-- 1 — iOS records QuickTime.
select ok(
  'video/quicktime' = any (select unnest(allowed_mime_types) from storage.buckets where id = 'clinical-attachments'),
  'The bucket accepts QuickTime, which is what an iPhone produces'
);

-- 2 — Android records MP4.
select ok(
  'video/mp4' = any (select unnest(allowed_mime_types) from storage.buckets where id = 'clinical-attachments'),
  'The bucket accepts MP4, which is what an Android phone produces'
);

-- 3 — A clip of a gait does not fit in twenty-five megabytes.
select ok(
  (select file_size_limit from storage.buckets where id = 'clinical-attachments') >= 104857600,
  'The size limit leaves room for a short clip rather than a still only'
);

-- 4 — Still private. The whole point of signing survives this change.
select is(
  (select public from storage.buckets where id = 'clinical-attachments'),
  false,
  'The bucket is still private, so a leaked path is not a readable URL'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a7000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

-- ---------------------------------------------------------------------------
-- Registering a video (2)
-- ---------------------------------------------------------------------------

-- 5
select isnt(
  public.register_attachment(
    p_id => 'd7000000-0000-0000-0000-000000000001',
    p_original_filename => 'lameness.mov',
    p_mime_type => 'video/quicktime',
    p_size_bytes => 8388608,
    p_attachment_type => 'video',
    p_patient_id => 'c7000000-0000-0000-0000-000000000001'
  ),
  null,
  'A video registers and is given a storage path'
);

-- 6 — Named for what it is, so a list of attachments can be scanned.
select is(
  (select attachment_type from public.attachments where id = 'd7000000-0000-0000-0000-000000000001'),
  'video',
  'The attachment is recorded as a video rather than as "other"'
);

-- 7 — The function validates before inserting, so the error is a sentence.
select throws_ok(
  $$select public.register_attachment(
      p_id => 'd7000000-0000-0000-0000-000000000009',
      p_original_filename => 'thing.bin',
      p_mime_type => 'application/octet-stream',
      p_size_bytes => 10,
      p_attachment_type => 'hologram',
      p_patient_id => 'c7000000-0000-0000-0000-000000000001'
    )$$,
  '22023',
  'Invalid attachment type',
  'An unknown attachment type is still refused'
);

-- ---------------------------------------------------------------------------
-- A folder picture stays a photograph (2)
-- ---------------------------------------------------------------------------

-- 8 — A video as the profile picture would render as a broken image on every
-- screen that shows the folder. set_patient_photo already refused anything that
-- was not a photograph, so admitting videos to the type list did not open this;
-- the test is here because nothing had checked that it stayed shut.
--
-- Through the RPC rather than a direct update, because that is the only way in:
-- authenticated holds no write on patients by design.
select throws_ok(
  $$select public.set_patient_photo(
      p_patient_id => 'c7000000-0000-0000-0000-000000000001',
      p_attachment_id => 'd7000000-0000-0000-0000-000000000001'
    )$$,
  '22023',
  'Only a photograph can be a folder picture',
  'A video cannot be set as the animal''s folder picture'
);

select public.register_attachment(
  p_id => 'd7000000-0000-0000-0000-000000000002',
  p_original_filename => 'heifer.jpg',
  p_mime_type => 'image/jpeg',
  p_size_bytes => 204800,
  p_attachment_type => 'photo',
  p_patient_id => 'c7000000-0000-0000-0000-000000000001'
);

-- 9
select lives_ok(
  $$select public.set_patient_photo(
      p_patient_id => 'c7000000-0000-0000-0000-000000000001',
      p_attachment_id => 'd7000000-0000-0000-0000-000000000002'
    )$$,
  'A photograph is still accepted as the folder picture'
);

select * from finish();
rollback;
