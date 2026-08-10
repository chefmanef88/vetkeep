begin;

create extension if not exists pgtap with schema extensions;
select plan(81);

-- ---------------------------------------------------------------------------
-- Fixtures. Auth users use the 90000000- range and vets the a0000000- range so
-- they cannot collide with the other Phase 1 / Phase 2 test files.
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('90000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-inv-a@example.test', crypt('Strong-Test-Password-1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('90000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vet-inv-b@example.test', crypt('Strong-Test-Password-2!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.vets (
  id, auth_user_id, full_name, phone_display, phone_e164
) values
  ('a0000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'Vet Inv A', '0246111111', '+233246111111'),
  ('a0000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000002', 'Vet Inv B', '0246222222', '+233246222222');

insert into public.vet_devices (
  id, vet_id, device_name, platform, last_authenticated_at
) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Vet Inv A iPhone', 'ios', now());

insert into public.patients (
  id, vet_id, patient_code, name, species, sex
) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'VK-P-AAA111', 'Bella', 'dog', 'female'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'VK-P-BBB222', 'Rex', 'dog', 'male');

-- public.visits is owned by the visits migration; only the columns this module
-- depends on (id, vet_id) plus that table's own not-null columns are supplied.
insert into public.visits (
  id, vet_id, patient_id, visit_date, visit_type
) values
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', now(), 'home_call'),
  ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', now(), 'home_call');

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

-- ---------------------------------------------------------------------------
-- Inventory items (assertions 1-11)
-- ---------------------------------------------------------------------------

-- 1
select lives_ok(
  $$select public.create_inventory_item(
      'e0000000-0000-0000-0000-000000000001', 'Amoxicillin', 'drug', 'vial', 10,
      'b0000000-0000-0000-0000-000000000001'
    )$$,
  'Vet A can create an inventory item'
);
-- 2
select is((select count(*)::integer from public.inventory_items), 1, 'Vet A sees exactly the item they created');
-- 3
select lives_ok(
  $$select public.create_inventory_item(
      'e0000000-0000-0000-0000-000000000001', 'Amoxicillin', 'drug', 'vial', 10,
      'b0000000-0000-0000-0000-000000000001'
    )$$,
  'Retrying create_inventory_item with the same ID is idempotent'
);
-- 4
select is((select count(*)::integer from public.inventory_items), 1, 'Idempotent retry does not create a duplicate item');
-- 5
select throws_ok(
  $$select public.create_inventory_item(
      gen_random_uuid(), 'Mystery Powder', 'medicine', 'vial', 1
    )$$,
  '22023',
  'Invalid inventory item type',
  'create_inventory_item rejects an unknown item type'
);
-- 6
select throws_ok(
  $$select public.create_inventory_item(
      gen_random_uuid(), 'Negative Threshold Item', 'consumable', 'pack', -5
    )$$,
  '22023',
  'Reorder threshold cannot be negative',
  'create_inventory_item rejects a negative reorder threshold'
);
-- 7
select throws_ok(
  $$insert into public.inventory_items (id, vet_id, item_name, item_type, unit)
    values (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'Illegal', 'drug', 'vial')$$,
  '42501',
  null,
  'Direct inventory item inserts are denied'
);
-- 8
select throws_ok(
  $$update public.inventory_items set item_name = 'Tampered'
    where id = 'e0000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'Direct inventory item updates are denied'
);
-- 9
select lives_ok(
  $$select public.update_inventory_item(
      'e0000000-0000-0000-0000-000000000001', 'Amoxicillin LA', 'drug', 'vial', 15
    )$$,
  'Vet A can update their own inventory item'
);
-- 10
select is(
  (select item_name from public.inventory_items where id = 'e0000000-0000-0000-0000-000000000001'),
  'Amoxicillin LA',
  'Inventory item update is reflected'
);
-- 11
select throws_ok(
  $$select public.update_inventory_item(
      gen_random_uuid(), 'Nonexistent Item', 'drug', 'vial', 1
    )$$,
  'P0002',
  'Inventory item not found',
  'update_inventory_item rejects an unknown item'
);

-- ---------------------------------------------------------------------------
-- Restocking (assertions 12-20)
-- ---------------------------------------------------------------------------

-- 12
select throws_ok(
  $$insert into public.inventory_batches (id, vet_id, item_id, quantity_on_hand)
    values (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001',
            'e0000000-0000-0000-0000-000000000001', 999)$$,
  '42501',
  null,
  'Direct inventory batch inserts are denied'
);
-- 13
select lives_ok(
  $$select public.restock_inventory_batch(
      'f0000000-0000-0000-0000-000000000001',
      'aa000000-0000-0000-0000-000000000001',
      'e0000000-0000-0000-0000-000000000001',
      20, 'LOT-A', (current_date + 365)
    )$$,
  'Vet A can restock a batch'
);
-- 14
select is(
  (select quantity_on_hand from public.inventory_batches where id = 'f0000000-0000-0000-0000-000000000001'),
  20.00::numeric(10,2),
  'Restock increases quantity on hand'
);
-- 15
select is((select count(*)::integer from public.inventory_movements), 1, 'Restock records exactly one movement');
-- 16
select lives_ok(
  $$select public.restock_inventory_batch(
      'f0000000-0000-0000-0000-000000000001',
      'aa000000-0000-0000-0000-000000000001',
      'e0000000-0000-0000-0000-000000000001',
      20, 'LOT-A', (current_date + 365)
    )$$,
  'Retrying restock_inventory_batch with the same movement ID is idempotent'
);
-- 17
select is(
  (select quantity_on_hand from public.inventory_batches where id = 'f0000000-0000-0000-0000-000000000001'),
  20.00::numeric(10,2),
  'A retried restock does not credit stock twice'
);
-- 18
select is((select count(*)::integer from public.inventory_movements), 1, 'A retried restock does not create a second movement');
-- 19
select throws_ok(
  $$select public.restock_inventory_batch(
      gen_random_uuid(), gen_random_uuid(),
      'e0000000-0000-0000-0000-000000000001', 0
    )$$,
  '22023',
  'Restock quantity must be greater than zero',
  'restock_inventory_batch rejects a zero quantity'
);
-- 20
select throws_ok(
  $$select public.restock_inventory_batch(
      gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 5
    )$$,
  'P0002',
  'Inventory item not found',
  'restock_inventory_batch rejects an unknown item'
);

-- ---------------------------------------------------------------------------
-- Visit-linked consumption (assertions 21-34)
-- ---------------------------------------------------------------------------

-- 21
select lives_ok(
  $$select public.record_inventory_consumption(
      'aa000000-0000-0000-0000-000000000002',
      'f0000000-0000-0000-0000-000000000001',
      'd0000000-0000-0000-0000-000000000001',
      5, 'Given during house call'
    )$$,
  'Vet A can record consumption against a visit'
);
-- 22
select is(
  (select quantity_on_hand from public.inventory_batches where id = 'f0000000-0000-0000-0000-000000000001'),
  15.00::numeric(10,2),
  'Consumption decreases quantity on hand'
);
-- 23
select is(
  (select visit_id from public.inventory_movements where id = 'aa000000-0000-0000-0000-000000000002'),
  'd0000000-0000-0000-0000-000000000001'::uuid,
  'Consumption movement references the visit it happened on'
);
-- 24
select lives_ok(
  $$select public.record_inventory_consumption(
      'aa000000-0000-0000-0000-000000000002',
      'f0000000-0000-0000-0000-000000000001',
      'd0000000-0000-0000-0000-000000000001',
      5, 'Given during house call'
    )$$,
  'Retrying record_inventory_consumption with the same movement ID is idempotent'
);
-- 25
select is(
  (select quantity_on_hand from public.inventory_batches where id = 'f0000000-0000-0000-0000-000000000001'),
  15.00::numeric(10,2),
  'A retried offline consumption sync does not double-deduct stock'
);
-- 26
select is((select count(*)::integer from public.inventory_movements), 2, 'A retried consumption does not create a second movement');
-- 27
select throws_ok(
  $$select public.record_inventory_consumption(
      gen_random_uuid(),
      'f0000000-0000-0000-0000-000000000001',
      'd0000000-0000-0000-0000-000000000001',
      999
    )$$,
  '22023',
  'Insufficient stock in batch to record this consumption',
  'Consuming more than the quantity on hand is rejected with a clear error'
);
-- 28
select is(
  (select quantity_on_hand from public.inventory_batches where id = 'f0000000-0000-0000-0000-000000000001'),
  15.00::numeric(10,2),
  'A rejected consumption leaves quantity on hand unchanged'
);
-- 29
select throws_ok(
  $$select public.record_inventory_consumption(
      gen_random_uuid(),
      'f0000000-0000-0000-0000-000000000001',
      null::uuid,
      1
    )$$,
  '22023',
  'A consumption movement must reference a visit',
  'Consumption without a visit is rejected'
);
-- 30
select throws_ok(
  $$select public.record_inventory_consumption(
      gen_random_uuid(),
      'f0000000-0000-0000-0000-000000000001',
      'd0000000-0000-0000-0000-000000000001',
      0
    )$$,
  '22023',
  'Consumption quantity must be greater than zero',
  'Consumption of zero units is rejected'
);
-- 31
select throws_ok(
  $$select public.record_inventory_consumption(
      gen_random_uuid(),
      'f0000000-0000-0000-0000-000000000001',
      'd0000000-0000-0000-0000-000000000002',
      1
    )$$,
  'P0002',
  'Visit not found',
  'Vet A cannot record consumption against another vet visit'
);
-- 32
select throws_ok(
  $$update public.inventory_movements set notes = 'tampered'$$,
  '42501',
  null,
  'Direct inventory movement updates are denied to client roles'
);
-- 33
select throws_ok(
  $$delete from public.inventory_movements$$,
  '42501',
  null,
  'Direct inventory movement deletes are denied to client roles'
);
-- 34
select throws_ok(
  $$update public.inventory_batches set quantity_on_hand = 9999
    where id = 'f0000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'Clients cannot update quantity_on_hand directly'
);

-- ---------------------------------------------------------------------------
-- Corrections via adjustment movements (assertions 35-42)
-- ---------------------------------------------------------------------------

-- 35
select lives_ok(
  $$select public.adjust_inventory(
      'aa000000-0000-0000-0000-000000000003',
      'f0000000-0000-0000-0000-000000000001',
      -3, 'Spillage in transit'
    )$$,
  'Vet A can correct stock with a new adjustment movement'
);
-- 36
select is(
  (select quantity_on_hand from public.inventory_batches where id = 'f0000000-0000-0000-0000-000000000001'),
  12.00::numeric(10,2),
  'Adjustment updates quantity on hand'
);
-- 37
select lives_ok(
  $$select public.adjust_inventory(
      'aa000000-0000-0000-0000-000000000003',
      'f0000000-0000-0000-0000-000000000001',
      -3, 'Spillage in transit'
    )$$,
  'Retrying adjust_inventory with the same movement ID is idempotent'
);
-- 38
select is(
  (select quantity_on_hand from public.inventory_batches where id = 'f0000000-0000-0000-0000-000000000001'),
  12.00::numeric(10,2),
  'A retried adjustment is not applied twice'
);
-- 39
select throws_ok(
  $$select public.adjust_inventory(
      gen_random_uuid(),
      'f0000000-0000-0000-0000-000000000001',
      -999, 'Bad count'
    )$$,
  '22023',
  'Adjustment would drive batch stock below zero',
  'An adjustment cannot drive stock below zero'
);
-- 40
select throws_ok(
  $$select public.adjust_inventory(
      gen_random_uuid(),
      'f0000000-0000-0000-0000-000000000001',
      0, 'No change'
    )$$,
  '22023',
  'Adjustment quantity cannot be zero',
  'A zero adjustment is rejected'
);
-- 41
select throws_ok(
  $$select public.adjust_inventory(
      gen_random_uuid(),
      'f0000000-0000-0000-0000-000000000001',
      -1, '  '
    )$$,
  '22023',
  'Adjustment reason is required',
  'An adjustment without a reason is rejected'
);
-- 42
select is(
  (select sum(quantity) from public.inventory_movements
   where batch_id = 'f0000000-0000-0000-0000-000000000001'),
  (select quantity_on_hand::numeric from public.inventory_batches
   where id = 'f0000000-0000-0000-0000-000000000001'),
  'The append-only movement ledger reconciles with quantity on hand'
);

-- ---------------------------------------------------------------------------
-- Expiry exclusion and derived low-stock status (assertions 43-53)
-- ---------------------------------------------------------------------------

-- 43
select lives_ok(
  $$select public.restock_inventory_batch(
      'f0000000-0000-0000-0000-000000000002',
      'aa000000-0000-0000-0000-000000000004',
      'e0000000-0000-0000-0000-000000000001',
      8, 'LOT-B', (current_date - 1)
    )$$,
  'Vet A can record a batch that has already expired'
);
-- 44
select is(
  (select sum(quantity_on_hand) from public.inventory_batches
   where item_id = 'e0000000-0000-0000-0000-000000000001'),
  20.00::numeric,
  'Both batches physically hold stock'
);
-- 45
select is(
  public.inventory_available_quantity('e0000000-0000-0000-0000-000000000001'::uuid),
  12.00::numeric,
  'Expired batches are excluded from available quantity'
);
-- 46
select is(
  (select available_quantity from public.inventory_item_stock
   where item_id = 'e0000000-0000-0000-0000-000000000001'),
  12.00::numeric(12,2),
  'Stock view reports available quantity without expired batches'
);
-- 47
select is(
  (select expired_quantity from public.inventory_item_stock
   where item_id = 'e0000000-0000-0000-0000-000000000001'),
  8.00::numeric(12,2),
  'Stock view reports expired quantity separately'
);
-- 48
select is(
  (select total_quantity_on_hand from public.inventory_item_stock
   where item_id = 'e0000000-0000-0000-0000-000000000001'),
  20.00::numeric(12,2),
  'Stock view still reports the total physically on hand'
);
-- 49
select is(
  (select is_low_stock from public.inventory_item_stock
   where item_id = 'e0000000-0000-0000-0000-000000000001'),
  true,
  'An item is low on stock once expired batches are excluded'
);
-- 50
select lives_ok(
  $$select public.create_inventory_item(
      'e0000000-0000-0000-0000-000000000002', 'Gauze Swabs', 'consumable', 'pack', 2
    )$$,
  'Vet A can create a second inventory item'
);
-- 51
select lives_ok(
  $$select public.restock_inventory_batch(
      'f0000000-0000-0000-0000-000000000003',
      'aa000000-0000-0000-0000-000000000005',
      'e0000000-0000-0000-0000-000000000002',
      10
    )$$,
  'Vet A can restock the second item'
);
-- 52
select is(
  (select is_low_stock from public.inventory_item_stock
   where item_id = 'e0000000-0000-0000-0000-000000000002'),
  false,
  'A well stocked item is not flagged as low'
);
-- 53
select is((select count(*)::integer from public.inventory_item_stock), 2, 'Stock view exposes one row per live item');

-- ---------------------------------------------------------------------------
-- Expired write-off (assertions 54-59)
-- ---------------------------------------------------------------------------

-- 54
select lives_ok(
  $$select public.write_off_expired_batch(
      'aa000000-0000-0000-0000-000000000006',
      'f0000000-0000-0000-0000-000000000002',
      'Expired stock discarded'
    )$$,
  'Vet A can write off an expired batch'
);
-- 55
select is(
  (select quantity_on_hand from public.inventory_batches where id = 'f0000000-0000-0000-0000-000000000002'),
  0.00::numeric(10,2),
  'Writing off an expired batch zeroes its quantity on hand'
);
-- 56
select is(
  (select quantity from public.inventory_movements where id = 'aa000000-0000-0000-0000-000000000006'),
  -8.00::numeric(10,2),
  'The write-off movement records the full negative quantity'
);
-- 57
select lives_ok(
  $$select public.write_off_expired_batch(
      'aa000000-0000-0000-0000-000000000006',
      'f0000000-0000-0000-0000-000000000002',
      'Expired stock discarded'
    )$$,
  'Retrying write_off_expired_batch with the same movement ID is idempotent'
);
-- 58
select is(
  (select quantity_on_hand from public.inventory_batches where id = 'f0000000-0000-0000-0000-000000000002'),
  0.00::numeric(10,2),
  'A retried write-off does not change stock again'
);
-- 59
select throws_ok(
  $$select public.write_off_expired_batch(
      'aa000000-0000-0000-0000-000000000007',
      'f0000000-0000-0000-0000-000000000001'
    )$$,
  '22023',
  'Batch has not expired',
  'A batch that has not expired cannot be written off as expired'
);

-- ---------------------------------------------------------------------------
-- Cross-tenant isolation (assertions 60-66)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}', true);

-- 60
select is((select count(*)::integer from public.inventory_items), 0, 'Vet B cannot see Vet A inventory items');
-- 61
select is((select count(*)::integer from public.inventory_batches), 0, 'Vet B cannot see Vet A inventory batches');
-- 62
select is((select count(*)::integer from public.inventory_movements), 0, 'Vet B cannot see Vet A inventory movements');
-- 63
select is((select count(*)::integer from public.inventory_item_stock), 0, 'Vet B cannot see Vet A rows in the stock view');
-- 64
select throws_ok(
  $$select public.record_inventory_consumption(
      'aa000000-0000-0000-0000-000000000008',
      'f0000000-0000-0000-0000-000000000001',
      'd0000000-0000-0000-0000-000000000002',
      1
    )$$,
  'P0002',
  'Inventory batch not found',
  'Vet B cannot consume stock from a Vet A batch'
);
-- 65
select throws_ok(
  $$select public.create_inventory_item(
      'e0000000-0000-0000-0000-000000000001', 'Vet B Amoxicillin', 'drug', 'vial', 1
    )$$,
  '42501',
  'Inventory item ID is unavailable',
  'Vet B cannot claim a Vet A inventory item ID'
);
-- 66
select lives_ok(
  $$select public.create_inventory_item(
      'e0000000-0000-0000-0000-000000000003', 'Vet B Saline', 'consumable', 'bag', 1
    )$$,
  'Vet B can create their own inventory item'
);

-- ---------------------------------------------------------------------------
-- AAL1 sessions (assertions 67-70)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);

-- 67
select throws_ok(
  $$select public.create_inventory_item(
      gen_random_uuid(), 'AAL1 Item', 'drug', 'vial', 1
    )$$,
  '42501',
  'Multi-factor authentication required',
  'AAL1 sessions cannot create an inventory item'
);
-- 68
select throws_ok(
  $$select public.record_inventory_consumption(
      gen_random_uuid(),
      'f0000000-0000-0000-0000-000000000001',
      'd0000000-0000-0000-0000-000000000001',
      1
    )$$,
  '42501',
  'Multi-factor authentication required',
  'AAL1 sessions cannot record inventory consumption'
);
-- 69
select throws_ok(
  $$select public.restock_inventory_batch(
      gen_random_uuid(), gen_random_uuid(),
      'e0000000-0000-0000-0000-000000000001', 1
    )$$,
  '42501',
  'Multi-factor authentication required',
  'AAL1 sessions cannot restock a batch'
);
-- 70
select is((select count(*)::integer from public.inventory_items), 0, 'AAL1 sessions cannot read inventory items');

reset role;

-- ---------------------------------------------------------------------------
-- Append-only enforcement, grants, and derived-only low stock (71-81)
-- ---------------------------------------------------------------------------

-- 71
select throws_ok(
  $$update public.inventory_movements set notes = 'tampered'$$,
  'P0001',
  'inventory_movements is append-only',
  'inventory_movements rejects UPDATE even for a privileged role'
);
-- 72
select throws_ok(
  $$delete from public.inventory_movements$$,
  'P0001',
  'inventory_movements is append-only',
  'inventory_movements rejects DELETE even for a privileged role'
);
-- 73
select ok(
  not has_function_privilege(
    'anon',
    'public.record_inventory_consumption(uuid,uuid,uuid,numeric,text,uuid)',
    'EXECUTE'
  ),
  'Anonymous role cannot execute record_inventory_consumption'
);
-- 74
select ok(
  has_function_privilege(
    'authenticated',
    'public.record_inventory_consumption(uuid,uuid,uuid,numeric,text,uuid)',
    'EXECUTE'
  ),
  'Authenticated role can execute record_inventory_consumption'
);
-- 75
select ok(
  not has_function_privilege(
    'anon',
    'public.restock_inventory_batch(uuid,uuid,uuid,numeric,text,date,bigint,timestamptz,text,uuid)',
    'EXECUTE'
  ),
  'Anonymous role cannot execute restock_inventory_batch'
);
-- 76
select ok(
  has_function_privilege(
    'authenticated',
    'public.restock_inventory_batch(uuid,uuid,uuid,numeric,text,date,bigint,timestamptz,text,uuid)',
    'EXECUTE'
  ),
  'Authenticated role can execute restock_inventory_batch'
);
-- 77
select ok(
  not has_function_privilege(
    'anon',
    'public.adjust_inventory(uuid,uuid,numeric,text,uuid)',
    'EXECUTE'
  ),
  'Anonymous role cannot execute adjust_inventory'
);
-- 78
select ok(
  not has_function_privilege(
    'anon',
    'public.write_off_expired_batch(uuid,uuid,text,uuid)',
    'EXECUTE'
  ),
  'Anonymous role cannot execute write_off_expired_batch'
);
-- 79
select ok(
  not has_function_privilege(
    'anon',
    'public.create_inventory_item(uuid,text,text,text,numeric,uuid)',
    'EXECUTE'
  ),
  'Anonymous role cannot execute create_inventory_item'
);
-- 80
select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('inventory_items', 'inventory_batches', 'inventory_movements')
      and column_name = 'low_stock'
  ),
  'Low-stock status is derived, never stored on an inventory table'
);

update public.inventory_batches
set deleted_at = now()
where id = 'f0000000-0000-0000-0000-000000000001';

-- 81
select is(
  (select available_quantity from public.inventory_item_stock
   where item_id = 'e0000000-0000-0000-0000-000000000001'),
  0.00::numeric(12,2),
  'Soft-deleted batches are excluded from available quantity'
);

select * from finish();
rollback;
