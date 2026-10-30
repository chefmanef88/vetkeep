begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('a8000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-del-a@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (
  id, auth_user_id, full_name, phone_display, phone_e164
) values
  ('b8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001', 'Vet Del A', '0243800001', '+233243800001');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a8000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a8000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

select public.create_patient(
  p_id => 'c8000000-0000-0000-0000-000000000001',
  p_patient_code => 'VK-P-DEG001',
  p_name => 'Wrong Animal',
  p_species => 'goat',
  p_sex => 'male'
);

-- ---------------------------------------------------------------------------
-- A folder photograph can always be withdrawn (3)
-- ---------------------------------------------------------------------------

select public.register_attachment(
  p_id => 'd8000000-0000-0000-0000-000000000001',
  p_original_filename => 'wrong-goat.jpg',
  p_mime_type => 'image/jpeg',
  p_size_bytes => 102400,
  p_attachment_type => 'photo',
  p_patient_id => 'c8000000-0000-0000-0000-000000000001'
);

select public.set_patient_photo(
  p_patient_id => 'c8000000-0000-0000-0000-000000000001',
  p_attachment_id => 'd8000000-0000-0000-0000-000000000001'
);

-- 1 — Identification, not a clinical finding. A picture of the wrong animal on
-- a folder is worse than no picture at all.
select lives_ok(
  $$select public.delete_attachment(
      p_id => 'd8000000-0000-0000-0000-000000000001',
      p_reason => 'Photograph of the wrong goat'
    )$$,
  'A folder photograph can be withdrawn'
);

-- 2 — Soft, not hard. Brief 8.2: clinical material is not erased through the
-- tenant application.
select isnt(
  (select deleted_at from public.attachments where id = 'd8000000-0000-0000-0000-000000000001'),
  null,
  'The row stays and is marked deleted rather than being erased'
);

-- 3 — Otherwise the folder renders a broken image on every screen it appears on.
select is(
  (select profile_photo_attachment_id from public.patients where id = 'c8000000-0000-0000-0000-000000000001'),
  null,
  'The folder stops pointing at the photograph it no longer has'
);

-- ---------------------------------------------------------------------------
-- On a draft consultation, yes; once signed, no (3)
-- ---------------------------------------------------------------------------

select public.create_visit(
  p_id => 'e8000000-0000-0000-0000-000000000001',
  p_patient_id => 'c8000000-0000-0000-0000-000000000001',
  p_visit_date => now(),
  p_visit_type => 'home_call',
  p_record_code => 'VK-R-DEG001'
);

select public.register_attachment(
  p_id => 'd8000000-0000-0000-0000-000000000002',
  p_original_filename => 'draft-shot.jpg',
  p_mime_type => 'image/jpeg',
  p_size_bytes => 102400,
  p_attachment_type => 'photo',
  p_visit_id => 'e8000000-0000-0000-0000-000000000001'
);

-- 4 — An unsigned record was never a record.
select lives_ok(
  $$select public.delete_attachment(p_id => 'd8000000-0000-0000-0000-000000000002')$$,
  'An attachment on a draft consultation can be withdrawn'
);

select public.register_attachment(
  p_id => 'd8000000-0000-0000-0000-000000000003',
  p_original_filename => 'signed-shot.jpg',
  p_mime_type => 'image/jpeg',
  p_size_bytes => 102400,
  p_attachment_type => 'photo',
  p_visit_id => 'e8000000-0000-0000-0000-000000000001'
);

select public.mark_remaining_systems_normal('e8000000-0000-0000-0000-000000000001');
select public.complete_visit(p_visit_id => 'e8000000-0000-0000-0000-000000000001');

-- 5 — By then it is part of what was signed. The remedy is to void the record,
-- which keeps both the original and the reason.
select throws_ok(
  $$select public.delete_attachment(p_id => 'd8000000-0000-0000-0000-000000000003')$$,
  '42501',
  'This consultation has been signed, so its attachments cannot be removed. Void the record instead.',
  'An attachment on a signed consultation cannot be withdrawn'
);

-- 6 — And it really is still there.
select is(
  (select deleted_at from public.attachments where id = 'd8000000-0000-0000-0000-000000000003'),
  null,
  'The refused attachment is untouched'
);

-- ---------------------------------------------------------------------------
-- Ownership and audit (2)
-- ---------------------------------------------------------------------------

-- 7 — Deleting twice is not a way to discover that something existed.
select throws_ok(
  $$select public.delete_attachment(p_id => 'd8000000-0000-0000-0000-000000000001')$$,
  'P0002',
  'Attachment not found',
  'An already-withdrawn attachment cannot be withdrawn again'
);

-- 8 — Every one of the three deletion actions writes an audit event carrying
-- its reason (brief 8.2), and the reason lands in the column meant for it
-- rather than inside the metadata blob where nobody would look.
select is(
  (select reason from public.audit_events
     where action = 'attachment.deleted'
       and entity_id = 'd8000000-0000-0000-0000-000000000001'),
  'Photograph of the wrong goat',
  'Withdrawing an attachment is audited, with the reason the vet gave'
);

select * from finish();
rollback;
