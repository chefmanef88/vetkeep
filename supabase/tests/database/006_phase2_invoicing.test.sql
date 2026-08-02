begin;

create extension if not exists pgtap with schema extensions;
select plan(88);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('a1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-inv-a@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-inv-b@example.test', crypt('Strong-Test-Password-2!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (
  id, auth_user_id, full_name, phone_display, phone_e164
) values
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Vet Inv A', '0243333331', '+233243333331'),
  ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'Vet Inv B', '0243333332', '+233243333332');

insert into public.vet_devices (
  id, vet_id, device_name, platform, last_authenticated_at
) values
  ('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Vet Inv A Phone', 'android', now()),
  ('c1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 'Vet Inv B Phone', 'ios', now());

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

-- ---------------------------------------------------------------------------
-- Invoice creation and the client-supplied-id contract (assertions 1-12)
-- ---------------------------------------------------------------------------

-- 1
select lives_ok(
  $$select public.create_client(
      'd1000000-0000-0000-0000-000000000001', 'VK-C-9K3M7T', 'Invoice Client A',
      '024 000 0011', '+233240000011'
    )$$,
  'Vet A can create a client to invoice'
);

-- 2
select lives_ok(
  $$select public.create_invoice(
      'e1000000-0000-0000-0000-000000000001',
      'd1000000-0000-0000-0000-000000000001',
      'INV-2026-0001',
      null, 'GHS', 0, null, 'First house call',
      'c1000000-0000-0000-0000-000000000001'
    )$$,
  'Vet A can create an invoice'
);
-- 3
select is(
  (select status from public.visit_invoices where id = 'e1000000-0000-0000-0000-000000000001'),
  'draft',
  'A new invoice starts as a draft'
);
-- 4
select is(
  (select total_pesewas from public.visit_invoices where id = 'e1000000-0000-0000-0000-000000000001'),
  0::bigint,
  'A new invoice has a zero total'
);
-- 5
select is(
  (select currency from public.visit_invoices where id = 'e1000000-0000-0000-0000-000000000001'),
  'GHS',
  'Invoice currency is stored explicitly and defaults to GHS'
);

-- 6
select lives_ok(
  $$select public.create_invoice(
      'e1000000-0000-0000-0000-000000000001',
      'd1000000-0000-0000-0000-000000000001',
      'INV-2026-0001'
    )$$,
  'Retrying create_invoice with the same ID is idempotent'
);
-- 7
select is(
  (select count(*)::integer from public.visit_invoices),
  1,
  'Idempotent retry does not create a duplicate invoice'
);

-- 8
select throws_ok(
  $$select public.create_invoice(
      gen_random_uuid(), 'd1000000-0000-0000-0000-000000000001', 'INV-2026-0001'
    )$$,
  '22023',
  'Invoice number is already in use',
  'Invoice numbers are unique within a veterinarian account'
);
-- 9
select throws_ok(
  $$select public.create_invoice(
      gen_random_uuid(), gen_random_uuid(), 'INV-2026-0099'
    )$$,
  'P0002',
  'Client not found',
  'An invoice cannot be raised against an unknown client'
);

-- 10
select throws_ok(
  $$insert into public.visit_invoices (id, vet_id, client_id, invoice_number)
    values (
      gen_random_uuid(),
      'b1000000-0000-0000-0000-000000000001',
      'd1000000-0000-0000-0000-000000000001',
      'INV-DIRECT-0001'
    )$$,
  '42501',
  null,
  'Direct invoice inserts are denied'
);
-- 11
select throws_ok(
  $$update public.visit_invoices
    set total_pesewas = 1
    where id = 'e1000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'A client role cannot set invoice totals directly'
);
-- 12
select throws_ok(
  $$update public.visit_invoices
    set status = 'paid'
    where id = 'e1000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'A client role cannot set invoice status directly'
);

-- ---------------------------------------------------------------------------
-- Items drive the totals (assertions 13-27)
-- ---------------------------------------------------------------------------

-- 13
select throws_ok(
  $$select public.issue_invoice('e1000000-0000-0000-0000-000000000001')$$,
  '22023',
  'An invoice must have at least one item before it is issued',
  'An empty invoice cannot be issued'
);

-- 14
select lives_ok(
  $$select public.add_invoice_item(
      'f1000000-0000-0000-0000-000000000001',
      'e1000000-0000-0000-0000-000000000001',
      'Home consultation', 1, 5000
    )$$,
  'Vet A can add an invoice item'
);
-- 15
select is(
  (select subtotal_pesewas from public.visit_invoices where id = 'e1000000-0000-0000-0000-000000000001'),
  5000::bigint,
  'Subtotal is recomputed when an item is added'
);
-- 16
select is(
  (select total_pesewas from public.visit_invoices where id = 'e1000000-0000-0000-0000-000000000001'),
  5000::bigint,
  'Total is recomputed when an item is added'
);

-- A retried offline sync replays the same client-generated item ID.
-- 17
select lives_ok(
  $$select public.add_invoice_item(
      'f1000000-0000-0000-0000-000000000001',
      'e1000000-0000-0000-0000-000000000001',
      'Home consultation', 1, 5000
    )$$,
  'Retrying add_invoice_item with the same ID is idempotent'
);
-- 18
select is(
  (select count(*)::integer from public.invoice_items
   where invoice_id = 'e1000000-0000-0000-0000-000000000001'),
  1,
  'A retried item sync does not create a duplicate line'
);
-- 19
select is(
  (select total_pesewas from public.visit_invoices where id = 'e1000000-0000-0000-0000-000000000001'),
  5000::bigint,
  'A retried item sync does not double-count the line total'
);

-- 20
select lives_ok(
  $$select public.add_invoice_item(
      'f1000000-0000-0000-0000-000000000002',
      'e1000000-0000-0000-0000-000000000001',
      'Rabies vaccine', 2, 2500
    )$$,
  'Vet A can add a second invoice item'
);
-- 21
select is(
  (select line_total_pesewas from public.invoice_items where id = 'f1000000-0000-0000-0000-000000000002'),
  5000::bigint,
  'Line total is quantity multiplied by unit price in whole pesewas'
);
-- 22
select is(
  (select total_pesewas from public.visit_invoices where id = 'e1000000-0000-0000-0000-000000000001'),
  10000::bigint,
  'Total reflects both items'
);
-- 23
select is(
  (select status from public.visit_invoices where id = 'e1000000-0000-0000-0000-000000000001'),
  'draft',
  'Adding items leaves an unissued invoice in draft'
);

-- 24
select throws_ok(
  $$select public.record_invoice_payment(
      'a2000000-0000-0000-0000-000000000001',
      'e1000000-0000-0000-0000-000000000001',
      1000, 'cash'
    )$$,
  '22023',
  'Invoice must be issued before recording a payment',
  'A draft invoice cannot receive payments'
);

-- 25
select lives_ok(
  $$select public.issue_invoice('e1000000-0000-0000-0000-000000000001')$$,
  'Vet A can issue a draft invoice'
);
-- 26
select is(
  (select status from public.visit_invoices where id = 'e1000000-0000-0000-0000-000000000001'),
  'unpaid',
  'Issuing moves the invoice from draft to unpaid'
);
-- 27
select is(
  (select issued_at is not null from public.visit_invoices where id = 'e1000000-0000-0000-0000-000000000001'),
  true,
  'Issuing stamps issued_at'
);

-- ---------------------------------------------------------------------------
-- Payments, including the offline retry contract (assertions 28-37)
-- ---------------------------------------------------------------------------

-- 28
select lives_ok(
  $$select public.record_invoice_payment(
      'a2000000-0000-0000-0000-000000000001',
      'e1000000-0000-0000-0000-000000000001',
      4000, 'momo', null, 'MOMO-REF-001'
    )$$,
  'Vet A can record a part payment'
);
-- 29
select is(
  (select amount_paid_pesewas from public.visit_invoices where id = 'e1000000-0000-0000-0000-000000000001'),
  4000::bigint,
  'Amount paid is recomputed from the recorded payment'
);
-- 30
select is(
  (select status from public.visit_invoices where id = 'e1000000-0000-0000-0000-000000000001'),
  'partial',
  'Status moves from unpaid to partial when a part payment lands'
);

-- A retried offline sync replays the same client-generated payment ID.
-- 31
select lives_ok(
  $$select public.record_invoice_payment(
      'a2000000-0000-0000-0000-000000000001',
      'e1000000-0000-0000-0000-000000000001',
      4000, 'momo', null, 'MOMO-REF-001'
    )$$,
  'Replaying a payment with the same ID is accepted rather than rejected'
);
-- 32
select is(
  (select amount_paid_pesewas from public.visit_invoices where id = 'e1000000-0000-0000-0000-000000000001'),
  4000::bigint,
  'A retried payment sync does NOT double-count the money'
);
-- 33
select is(
  (select count(*)::integer from public.invoice_payments
   where invoice_id = 'e1000000-0000-0000-0000-000000000001'),
  1,
  'A retried payment sync does not create a second payment row'
);
-- 34
select is(
  (select status from public.visit_invoices where id = 'e1000000-0000-0000-0000-000000000001'),
  'partial',
  'A retried payment sync leaves the status unchanged'
);

-- 35
select throws_ok(
  $$select public.record_invoice_payment(
      'a2000000-0000-0000-0000-000000000002',
      'e1000000-0000-0000-0000-000000000001',
      9000, 'cash'
    )$$,
  '22023',
  'Payment exceeds the outstanding invoice balance',
  'Overpayment is rejected with a clear error, not a raw constraint violation'
);
-- 36
select throws_ok(
  $$select public.record_invoice_payment(
      'a2000000-0000-0000-0000-000000000003',
      'e1000000-0000-0000-0000-000000000001',
      1000, 'crypto'
    )$$,
  '22023',
  'Invalid payment method',
  'Only methods describing money moved outside VetKeep are accepted'
);
-- 37
select throws_ok(
  $$select public.record_invoice_payment(
      'a2000000-0000-0000-0000-000000000004',
      'e1000000-0000-0000-0000-000000000001',
      0, 'cash'
    )$$,
  '22023',
  'Payment amount must be greater than zero',
  'A zero-value payment is rejected'
);

-- ---------------------------------------------------------------------------
-- Removing items recomputes, and can never strand recorded money (38-47)
-- ---------------------------------------------------------------------------

-- 38
select lives_ok(
  $$select public.remove_invoice_item('f1000000-0000-0000-0000-000000000002', 'Vaccine not administered')$$,
  'Vet A can remove an invoice item while the total still covers payments'
);
-- 39
select is(
  (select total_pesewas from public.visit_invoices where id = 'e1000000-0000-0000-0000-000000000001'),
  5000::bigint,
  'Total is recomputed when an item is removed'
);
-- 40
select is(
  (select deleted_at is not null from public.invoice_items where id = 'f1000000-0000-0000-0000-000000000002'),
  true,
  'A removed invoice item is soft-deleted, not erased'
);
-- 41
select is(
  (select status from public.visit_invoices where id = 'e1000000-0000-0000-0000-000000000001'),
  'partial',
  'The invoice stays partial while 4000 of 5000 is paid'
);

-- 42
select throws_ok(
  $$select public.remove_invoice_item('f1000000-0000-0000-0000-000000000001', 'Mistake')$$,
  '22023',
  'Recalculated invoice total is below the amount already paid',
  'An item cannot be removed if the total would fall below the amount already paid'
);

-- 43
select lives_ok(
  $$select public.record_invoice_payment(
      'a2000000-0000-0000-0000-000000000005',
      'e1000000-0000-0000-0000-000000000001',
      1000, 'cash'
    )$$,
  'Vet A can record the balancing payment'
);
-- 44
select is(
  (select amount_paid_pesewas from public.visit_invoices where id = 'e1000000-0000-0000-0000-000000000001'),
  5000::bigint,
  'Amount paid accumulates across payments'
);
-- 45
select is(
  (select status from public.visit_invoices where id = 'e1000000-0000-0000-0000-000000000001'),
  'paid',
  'Status moves from partial to paid when the balance is settled'
);
-- 46
select is(
  (select paid_at is not null from public.visit_invoices where id = 'e1000000-0000-0000-0000-000000000001'),
  true,
  'A settled invoice records paid_at'
);
-- 47
select throws_ok(
  $$select public.add_invoice_item(
      'f1000000-0000-0000-0000-000000000003',
      'e1000000-0000-0000-0000-000000000001',
      'Late addition', 1, 100
    )$$,
  '22023',
  'Paid or voided invoices cannot be modified',
  'A paid invoice cannot have items added to it'
);

-- ---------------------------------------------------------------------------
-- Voiding, not erasing (assertions 48-64)
-- ---------------------------------------------------------------------------

-- 48
select lives_ok(
  $$select public.create_invoice(
      'e1000000-0000-0000-0000-000000000002',
      'd1000000-0000-0000-0000-000000000001',
      'INV-2026-0002'
    )$$,
  'Vet A can create a second invoice'
);
-- 49
select lives_ok(
  $$select public.add_invoice_item(
      'f1000000-0000-0000-0000-000000000004',
      'e1000000-0000-0000-0000-000000000002',
      'House-call fee', 1, 8000
    )$$,
  'Vet A can add an item to the second invoice'
);
-- 50
select lives_ok(
  $$select public.issue_invoice('e1000000-0000-0000-0000-000000000002')$$,
  'Vet A can issue the second invoice'
);

-- 51
select throws_ok(
  $$select public.void_invoice('e1000000-0000-0000-0000-000000000002', '   ')$$,
  '22023',
  'Void reason is required',
  'Voiding an invoice requires a reason'
);
-- 52
select lives_ok(
  $$select public.void_invoice(
      'e1000000-0000-0000-0000-000000000002',
      'Raised against the wrong client'
    )$$,
  'Vet A can void an invoice with a reason'
);
-- 53
select is(
  (select status from public.visit_invoices where id = 'e1000000-0000-0000-0000-000000000002'),
  'voided',
  'A voided invoice reports the voided status'
);
-- 54
select is(
  (select void_reason from public.visit_invoices where id = 'e1000000-0000-0000-0000-000000000002'),
  'Raised against the wrong client',
  'The void reason is retained on the record'
);
-- 55
select throws_ok(
  $$select public.record_invoice_payment(
      'a2000000-0000-0000-0000-000000000006',
      'e1000000-0000-0000-0000-000000000002',
      1000, 'cash'
    )$$,
  '22023',
  'Voided invoices cannot receive payments',
  'A voided invoice rejects further payments'
);
-- 56
select throws_ok(
  $$select public.add_invoice_item(
      'f1000000-0000-0000-0000-000000000005',
      'e1000000-0000-0000-0000-000000000002',
      'Post-void addition', 1, 100
    )$$,
  '22023',
  'Paid or voided invoices cannot be modified',
  'A voided invoice rejects further item changes'
);
-- 57
select is(
  (select count(*)::integer from public.visit_invoices
   where id = 'e1000000-0000-0000-0000-000000000002'),
  1,
  'A voided invoice is preserved, not erased'
);
-- 58
select is(
  (select deleted_at is null from public.visit_invoices where id = 'e1000000-0000-0000-0000-000000000002'),
  true,
  'Voiding is not a deletion'
);
-- 59
select lives_ok(
  $$select public.void_invoice(
      'e1000000-0000-0000-0000-000000000002',
      'Raised against the wrong client'
    )$$,
  'Re-voiding the same invoice is idempotent'
);

-- 60
select throws_ok(
  $$delete from public.visit_invoices where id = 'e1000000-0000-0000-0000-000000000002'$$,
  '42501',
  null,
  'Tenants cannot hard-delete an invoice'
);
-- 61
select throws_ok(
  $$delete from public.invoice_payments$$,
  '42501',
  null,
  'Tenants cannot hard-delete payment records'
);
-- 62
select throws_ok(
  $$delete from public.invoice_items$$,
  '42501',
  null,
  'Tenants cannot hard-delete invoice items'
);
-- 63
select throws_ok(
  $$insert into public.invoice_payments (id, vet_id, invoice_id, amount_pesewas, method, paid_at)
    values (
      gen_random_uuid(),
      'b1000000-0000-0000-0000-000000000001',
      'e1000000-0000-0000-0000-000000000001',
      100, 'cash', now()
    )$$,
  '42501',
  null,
  'Direct payment inserts are denied'
);
-- 64
select throws_ok(
  $$update public.invoice_items
    set line_total_pesewas = 1
    where id = 'f1000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'Direct invoice item updates are denied'
);

-- ---------------------------------------------------------------------------
-- Cross-tenant isolation (assertions 65-75)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}', true);

-- 65
select is(
  (select count(*)::integer from public.visit_invoices),
  0,
  'Vet B cannot see Vet A invoices'
);
-- 66
select is(
  (select count(*)::integer from public.invoice_items),
  0,
  'Vet B cannot see Vet A invoice items'
);
-- 67
select is(
  (select count(*)::integer from public.invoice_payments),
  0,
  'Vet B cannot see Vet A payments'
);
-- 68
select throws_ok(
  $$select public.add_invoice_item(
      gen_random_uuid(), 'e1000000-0000-0000-0000-000000000001', 'Injected item', 1, 100
    )$$,
  'P0002',
  'Invoice not found',
  'Vet B cannot add an item to a Vet A invoice'
);
-- 69
select throws_ok(
  $$select public.record_invoice_payment(
      gen_random_uuid(), 'e1000000-0000-0000-0000-000000000001', 100, 'cash'
    )$$,
  'P0002',
  'Invoice not found',
  'Vet B cannot record a payment against a Vet A invoice'
);
-- 70
select throws_ok(
  $$select public.remove_invoice_item('f1000000-0000-0000-0000-000000000001', 'Cross-tenant removal')$$,
  'P0002',
  'Invoice item not found',
  'Vet B cannot remove a Vet A invoice item'
);
-- 71
select throws_ok(
  $$select public.void_invoice('e1000000-0000-0000-0000-000000000001', 'Cross-tenant void')$$,
  'P0002',
  'Invoice not found',
  'Vet B cannot void a Vet A invoice'
);
-- 72
select throws_ok(
  $$select public.issue_invoice('e1000000-0000-0000-0000-000000000002')$$,
  'P0002',
  'Invoice not found',
  'Vet B cannot issue a Vet A invoice'
);
-- 73
select throws_ok(
  $$select public.create_invoice(
      gen_random_uuid(), 'd1000000-0000-0000-0000-000000000001', 'INV-B-0001'
    )$$,
  'P0002',
  'Client not found',
  'Vet B cannot invoice a Vet A client'
);
-- 74
select lives_ok(
  $$select public.create_client(
      'd1000000-0000-0000-0000-000000000002', 'VK-C-2H8N4R', 'Invoice Client B',
      '024 000 0012', '+233240000012'
    )$$,
  'Vet B can create their own client'
);
-- 75
select lives_ok(
  $$select public.create_invoice(
      'e1000000-0000-0000-0000-000000000003',
      'd1000000-0000-0000-0000-000000000002',
      'INV-2026-0001'
    )$$,
  'Invoice numbers are unique per veterinarian, not globally'
);

-- ---------------------------------------------------------------------------
-- AAL1 sessions (assertions 76-79)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);

-- 76
select throws_ok(
  $$select public.create_invoice(
      gen_random_uuid(), 'd1000000-0000-0000-0000-000000000001', 'INV-AAL1-0001'
    )$$,
  '42501',
  'Multi-factor authentication required',
  'AAL1 sessions cannot create an invoice'
);
-- 77
select throws_ok(
  $$select public.record_invoice_payment(
      gen_random_uuid(), 'e1000000-0000-0000-0000-000000000001', 100, 'cash'
    )$$,
  '42501',
  'Multi-factor authentication required',
  'AAL1 sessions cannot record a payment'
);
-- 78
select throws_ok(
  $$select public.void_invoice('e1000000-0000-0000-0000-000000000001', 'AAL1 void attempt')$$,
  '42501',
  'Multi-factor authentication required',
  'AAL1 sessions cannot void an invoice'
);
-- 79
select is(
  (select count(*)::integer from public.visit_invoices),
  0,
  'AAL1 sessions cannot read invoices'
);

reset role;

-- ---------------------------------------------------------------------------
-- Grants, deletion guards, and storage types (assertions 80-88)
-- ---------------------------------------------------------------------------

-- 80
select ok(
  not has_function_privilege(
    'anon',
    'public.create_invoice(uuid,uuid,text,uuid,text,bigint,timestamptz,text,uuid)',
    'EXECUTE'
  ),
  'Anonymous role cannot execute create_invoice'
);
-- 81
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_invoice(uuid,uuid,text,uuid,text,bigint,timestamptz,text,uuid)',
    'EXECUTE'
  ),
  'Authenticated role can execute create_invoice'
);
-- 82
select ok(
  not has_function_privilege(
    'anon',
    'public.record_invoice_payment(uuid,uuid,bigint,text,timestamptz,text,text,uuid)',
    'EXECUTE'
  ),
  'Anonymous role cannot execute record_invoice_payment'
);
-- 83
select ok(
  has_function_privilege(
    'authenticated',
    'public.record_invoice_payment(uuid,uuid,bigint,text,timestamptz,text,text,uuid)',
    'EXECUTE'
  ),
  'Authenticated role can execute record_invoice_payment'
);

-- 84
select throws_ok(
  $$delete from public.visit_invoices where id = 'e1000000-0000-0000-0000-000000000001'$$,
  '42501',
  'Invoices, invoice items, and payment records cannot be hard-deleted',
  'Invoices cannot be hard-deleted even with elevated table privileges'
);
-- 85
select throws_ok(
  $$delete from public.invoice_payments where invoice_id = 'e1000000-0000-0000-0000-000000000001'$$,
  '42501',
  'Invoices, invoice items, and payment records cannot be hard-deleted',
  'Payment records cannot be hard-deleted even with elevated table privileges'
);

-- 86
select throws_ok(
  $$insert into public.invoice_items (
      id, vet_id, invoice_id, description, quantity,
      unit_price_pesewas, line_total_pesewas, sequence_number
    ) values (
      gen_random_uuid(),
      'b1000000-0000-0000-0000-000000000002',
      'e1000000-0000-0000-0000-000000000001',
      'Cross-tenant item', 1, 100, 100, 99
    )$$,
  '42501',
  'Invoice child records must belong to the same veterinarian as their invoice',
  'An invoice item whose vet_id differs from its invoice is rejected'
);
-- 87
select throws_ok(
  $$insert into public.invoice_payments (
      id, vet_id, invoice_id, amount_pesewas, method, paid_at
    ) values (
      gen_random_uuid(),
      'b1000000-0000-0000-0000-000000000002',
      'e1000000-0000-0000-0000-000000000001',
      100, 'cash', now()
    )$$,
  '42501',
  'Invoice child records must belong to the same veterinarian as their invoice',
  'A payment whose vet_id differs from its invoice is rejected'
);

-- 88
select is(
  (select pg_typeof(total_pesewas)::text from public.visit_invoices
   where id = 'e1000000-0000-0000-0000-000000000001'),
  'bigint',
  'Invoice money is stored as integer pesewas, never floating point'
);

select * from finish();
rollback;
