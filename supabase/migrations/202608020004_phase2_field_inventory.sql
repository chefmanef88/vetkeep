-- VetKeep Phase 2 field inventory: the drugs and consumables a single
-- veterinarian personally carries and uses on house calls (brief §7.8).
--
-- Scope guard (§7.8 and the §21 boundary): this is personal field-supply
-- tracking for one vet. There are deliberately no suppliers, purchase orders,
-- procurement workflows, warehouses, or stock locations in this module.
--
-- Follows the Phase 1 / Phase 2 pattern: client roles receive read access only,
-- every mutation runs through a SECURITY DEFINER RPC, and row identifiers are
-- client-generated so an offline device can retry a sync. The single most
-- important correctness property here is that a retried movement sync must not
-- deduct stock twice, so every movement RPC checks the movement id before it
-- touches quantity_on_hand.

create table public.inventory_items (
  id uuid primary key,
  vet_id uuid not null references public.vets(id) on delete restrict,
  item_name text not null check (char_length(trim(item_name)) between 1 and 160),
  item_type text not null check (item_type in ('drug', 'consumable', 'vaccine', 'other')),
  unit text not null check (char_length(trim(unit)) between 1 and 40),
  reorder_threshold numeric(10,2) check (reorder_threshold is null or reorder_threshold >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1 check (server_version > 0),
  created_by_device_id uuid references public.vet_devices(id) on delete set null,
  last_modified_by_device_id uuid references public.vet_devices(id) on delete set null,
  unique (vet_id, item_name)
);

create table public.inventory_batches (
  id uuid primary key,
  vet_id uuid not null references public.vets(id) on delete restrict,
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  batch_lot_number text check (batch_lot_number is null or char_length(trim(batch_lot_number)) between 1 and 80),
  expiry_date date,
  quantity_on_hand numeric(10,2) not null default 0 check (quantity_on_hand >= 0),
  unit_cost_pesewas bigint check (unit_cost_pesewas is null or unit_cost_pesewas >= 0),
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1 check (server_version > 0),
  created_by_device_id uuid references public.vet_devices(id) on delete set null,
  last_modified_by_device_id uuid references public.vet_devices(id) on delete set null
);

-- Append-only stock ledger. Quantities are signed so that the sum of a batch's
-- movements always reconciles with its quantity_on_hand: restock is positive,
-- consumption and expired write-off are negative, an adjustment may be either.
create table public.inventory_movements (
  id uuid primary key,
  vet_id uuid not null references public.vets(id) on delete restrict,
  batch_id uuid not null references public.inventory_batches(id) on delete restrict,
  visit_id uuid references public.visits(id) on delete restrict,
  movement_type text not null
    check (movement_type in ('restock', 'consumption', 'adjustment', 'expired_writeoff')),
  quantity numeric(10,2) not null check (quantity <> 0),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  -- Present so sync clients can treat all three inventory tables uniformly, but
  -- it always stays 1: this table is append-only, so there is no updated_at,
  -- deleted_at, or last_modified_by_device_id to go with it.
  server_version bigint not null default 1 check (server_version > 0),
  created_by_device_id uuid references public.vet_devices(id) on delete set null,
  -- Consumption is always recorded against the visit it happened on.
  check (movement_type <> 'consumption' or visit_id is not null),
  check (
    case movement_type
      when 'restock' then quantity > 0
      when 'consumption' then quantity < 0
      when 'expired_writeoff' then quantity < 0
      else quantity <> 0
    end
  )
);

comment on table public.inventory_items is
  'Personal field-supply catalogue for one veterinarian. Low-stock status is derived from public.inventory_item_stock, never stored on this row.';
comment on table public.inventory_batches is
  'Received batches of a carried item. quantity_on_hand is maintained only by the inventory RPCs; client roles never update it directly.';
comment on table public.inventory_movements is
  'Append-only stock ledger. A correction is a new adjustment movement, never an edit of a prior movement.';

create index inventory_items_vet_id_idx on public.inventory_items (vet_id) where deleted_at is null;
create index inventory_items_active_idx on public.inventory_items (vet_id, active) where deleted_at is null;

create index inventory_batches_vet_id_idx on public.inventory_batches (vet_id) where deleted_at is null;
create index inventory_batches_item_idx on public.inventory_batches (item_id) where deleted_at is null;
create index inventory_batches_expiry_idx on public.inventory_batches (vet_id, expiry_date) where deleted_at is null;

create index inventory_movements_vet_time_idx on public.inventory_movements (vet_id, created_at desc);
create index inventory_movements_batch_idx on public.inventory_movements (batch_id, created_at desc);
create index inventory_movements_visit_idx on public.inventory_movements (visit_id) where visit_id is not null;

create trigger inventory_items_set_row_version
before update on public.inventory_items
for each row execute function app_private.set_row_version();

create trigger inventory_batches_set_row_version
before update on public.inventory_batches
for each row execute function app_private.set_row_version();

-- inventory_movements has no set_row_version trigger because it is never
-- updated; the immutability trigger below rejects UPDATE and DELETE outright.
create or replace function app_private.prevent_inventory_movement_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'inventory_movements is append-only';
end;
$$;

create trigger inventory_movements_immutable
before update or delete on public.inventory_movements
for each row execute function app_private.prevent_inventory_movement_mutation();

-- ---------------------------------------------------------------------------
-- Derived stock position
--
-- Low-stock status is derived, never stored. Available quantity sums
-- quantity_on_hand across batches that are neither soft-deleted nor expired; a
-- batch that expired yesterday still holds stock physically but must not count
-- towards availability until an expired_writeoff movement reconciles it.
--
-- security_invoker = true makes the view run with the caller's privileges so
-- the row level security policies on the base tables provide tenant isolation.
-- ---------------------------------------------------------------------------

create view public.inventory_item_stock
with (security_invoker = true)
as
select
  s.item_id,
  s.vet_id,
  s.item_name,
  s.item_type,
  s.unit,
  s.active,
  s.reorder_threshold,
  s.available_quantity,
  s.expired_quantity,
  s.total_quantity_on_hand,
  (s.reorder_threshold is not null and s.available_quantity <= s.reorder_threshold) as is_low_stock
from (
  select
    i.id as item_id,
    i.vet_id,
    i.item_name,
    i.item_type,
    i.unit,
    i.active,
    i.reorder_threshold,
    coalesce(
      sum(b.quantity_on_hand) filter (
        where b.deleted_at is null
          and (b.expiry_date is null or b.expiry_date >= current_date)
      ),
      0
    )::numeric(12,2) as available_quantity,
    coalesce(
      sum(b.quantity_on_hand) filter (
        where b.deleted_at is null
          and b.expiry_date is not null
          and b.expiry_date < current_date
      ),
      0
    )::numeric(12,2) as expired_quantity,
    coalesce(
      sum(b.quantity_on_hand) filter (where b.deleted_at is null),
      0
    )::numeric(12,2) as total_quantity_on_hand
  from public.inventory_items i
  left join public.inventory_batches b
    on b.item_id = i.id
   and b.vet_id = i.vet_id
  where i.deleted_at is null
  group by i.id, i.vet_id, i.item_name, i.item_type, i.unit, i.active, i.reorder_threshold
) s;

comment on view public.inventory_item_stock is
  'Derived stock position per item. Expired and soft-deleted batches are excluded from available_quantity; is_low_stock is computed, not stored.';

-- Read-only helper for a single item. Reads are not audited: the audit trail
-- records mutations, and logging every stock lookup would bury real events.
create or replace function public.inventory_available_quantity(
  p_item_id uuid
)
returns numeric
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_available numeric;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  if not exists (
    select 1 from public.inventory_items
    where id = p_item_id and vet_id = v_vet_id and deleted_at is null
  ) then
    raise exception 'Inventory item not found' using errcode = 'P0002';
  end if;

  select coalesce(sum(b.quantity_on_hand), 0)
    into v_available
  from public.inventory_batches b
  where b.item_id = p_item_id
    and b.vet_id = v_vet_id
    and b.deleted_at is null
    and (b.expiry_date is null or b.expiry_date >= current_date);

  return v_available;
end;
$$;

-- ---------------------------------------------------------------------------
-- Inventory items
-- ---------------------------------------------------------------------------

create or replace function public.create_inventory_item(
  p_id uuid,
  p_item_name text,
  p_item_type text,
  p_unit text,
  p_reorder_threshold numeric default null,
  p_device_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  if char_length(trim(coalesce(p_item_name, ''))) not between 1 and 160 then
    raise exception 'Invalid inventory item name' using errcode = '22023';
  end if;

  if p_item_type is null or p_item_type not in ('drug', 'consumable', 'vaccine', 'other') then
    raise exception 'Invalid inventory item type' using errcode = '22023';
  end if;

  if char_length(trim(coalesce(p_unit, ''))) not between 1 and 40 then
    raise exception 'Invalid inventory unit' using errcode = '22023';
  end if;

  if p_reorder_threshold is not null and p_reorder_threshold < 0 then
    raise exception 'Reorder threshold cannot be negative' using errcode = '22023';
  end if;

  if p_reorder_threshold is not null and p_reorder_threshold > 99999999.99 then
    raise exception 'Reorder threshold is out of range' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.inventory_items
    where vet_id = v_vet_id and item_name = trim(p_item_name) and id <> p_id
  ) then
    raise exception 'An inventory item with this name already exists' using errcode = '22023';
  end if;

  insert into public.inventory_items (
    id, vet_id, item_name, item_type, unit, reorder_threshold,
    created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, trim(p_item_name), p_item_type, trim(p_unit), p_reorder_threshold,
    p_device_id, p_device_id
  )
  on conflict (id) do nothing;

  if not found then
    if exists (select 1 from public.inventory_items where id = p_id and vet_id = v_vet_id) then
      return p_id;
    end if;
    raise exception 'Inventory item ID is unavailable' using errcode = '42501';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'inventory_item.created', 'inventory_item', p_id, null,
    jsonb_build_object('item_type', p_item_type)
  );

  return p_id;
end;
$$;

create or replace function public.update_inventory_item(
  p_id uuid,
  p_item_name text,
  p_item_type text,
  p_unit text,
  p_reorder_threshold numeric default null,
  p_active boolean default true,
  p_device_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  if char_length(trim(coalesce(p_item_name, ''))) not between 1 and 160 then
    raise exception 'Invalid inventory item name' using errcode = '22023';
  end if;

  if p_item_type is null or p_item_type not in ('drug', 'consumable', 'vaccine', 'other') then
    raise exception 'Invalid inventory item type' using errcode = '22023';
  end if;

  if char_length(trim(coalesce(p_unit, ''))) not between 1 and 40 then
    raise exception 'Invalid inventory unit' using errcode = '22023';
  end if;

  if p_reorder_threshold is not null and p_reorder_threshold < 0 then
    raise exception 'Reorder threshold cannot be negative' using errcode = '22023';
  end if;

  if p_reorder_threshold is not null and p_reorder_threshold > 99999999.99 then
    raise exception 'Reorder threshold is out of range' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.inventory_items
    where vet_id = v_vet_id and item_name = trim(p_item_name) and id <> p_id
  ) then
    raise exception 'An inventory item with this name already exists' using errcode = '22023';
  end if;

  update public.inventory_items
  set item_name = trim(p_item_name),
      item_type = p_item_type,
      unit = trim(p_unit),
      reorder_threshold = p_reorder_threshold,
      active = coalesce(p_active, true),
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_id and vet_id = v_vet_id and deleted_at is null;

  if not found then
    raise exception 'Inventory item not found' using errcode = 'P0002';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'inventory_item.updated', 'inventory_item', p_id, null,
    jsonb_build_object('active', coalesce(p_active, true))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Stock movements
--
-- Every movement RPC follows the same shape:
--   1. authenticate and resolve the vet
--   2. validate the request
--   3. return early if this movement id was already applied (offline retry)
--   4. lock the batch row, validate the resulting quantity
--   5. append the movement, then write the new quantity_on_hand
-- Steps 3 to 5 run in one transaction holding the batch row lock, so a retried
-- sync can never deduct or credit the same movement twice.
-- ---------------------------------------------------------------------------

create or replace function public.restock_inventory_batch(
  p_batch_id uuid,
  p_movement_id uuid,
  p_item_id uuid,
  p_quantity numeric,
  p_batch_lot_number text default null,
  p_expiry_date date default null,
  p_unit_cost_pesewas bigint default null,
  p_received_at timestamptz default null,
  p_notes text default null,
  p_device_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_existing_vet_id uuid;
  v_existing_batch_id uuid;
  v_quantity numeric;
  v_quantity_on_hand numeric(10,2);
  v_new_quantity numeric;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  -- Quantities are rounded to the stored scale up front so the movement ledger
  -- and quantity_on_hand can never drift apart by a fraction of a unit.
  v_quantity := round(coalesce(p_quantity, 0), 2);

  if v_quantity <= 0 then
    raise exception 'Restock quantity must be greater than zero' using errcode = '22023';
  end if;

  if v_quantity > 1000000 then
    raise exception 'Restock quantity is out of range' using errcode = '22023';
  end if;

  if p_unit_cost_pesewas is not null and p_unit_cost_pesewas < 0 then
    raise exception 'Unit cost cannot be negative' using errcode = '22023';
  end if;

  if p_batch_lot_number is not null and char_length(trim(p_batch_lot_number)) > 80 then
    raise exception 'Batch lot number is too long' using errcode = '22023';
  end if;

  if p_notes is not null and char_length(trim(p_notes)) > 1000 then
    raise exception 'Movement notes are too long' using errcode = '22023';
  end if;

  -- Offline retry guard: the movement id is the idempotency key.
  select m.vet_id, m.batch_id
    into v_existing_vet_id, v_existing_batch_id
  from public.inventory_movements m
  where m.id = p_movement_id;

  if v_existing_vet_id is not null then
    if v_existing_vet_id <> v_vet_id then
      raise exception 'Inventory movement ID is unavailable' using errcode = '42501';
    end if;
    return v_existing_batch_id;
  end if;

  if not exists (
    select 1 from public.inventory_items
    where id = p_item_id and vet_id = v_vet_id and deleted_at is null
  ) then
    raise exception 'Inventory item not found' using errcode = 'P0002';
  end if;

  -- The batch row is created empty; the restock movement below is what credits
  -- the quantity, so receiving more into an existing batch takes the same path.
  insert into public.inventory_batches (
    id, vet_id, item_id, batch_lot_number, expiry_date,
    quantity_on_hand, unit_cost_pesewas, received_at,
    created_by_device_id, last_modified_by_device_id
  ) values (
    p_batch_id, v_vet_id, p_item_id,
    nullif(trim(p_batch_lot_number), ''), p_expiry_date,
    0, p_unit_cost_pesewas, coalesce(p_received_at, now()),
    p_device_id, p_device_id
  )
  on conflict (id) do nothing;

  if not found then
    if not exists (
      select 1 from public.inventory_batches
      where id = p_batch_id
        and vet_id = v_vet_id
        and item_id = p_item_id
        and deleted_at is null
    ) then
      raise exception 'Inventory batch ID is unavailable' using errcode = '42501';
    end if;
  end if;

  select b.quantity_on_hand
    into v_quantity_on_hand
  from public.inventory_batches b
  where b.id = p_batch_id and b.vet_id = v_vet_id and b.deleted_at is null
  for update;

  if not found then
    raise exception 'Inventory batch not found' using errcode = 'P0002';
  end if;

  v_new_quantity := v_quantity_on_hand + v_quantity;

  if v_new_quantity > 99999999.99 then
    raise exception 'Batch quantity on hand is out of range' using errcode = '22023';
  end if;

  insert into public.inventory_movements (
    id, vet_id, batch_id, visit_id, movement_type, quantity, notes, created_by_device_id
  ) values (
    p_movement_id, v_vet_id, p_batch_id, null, 'restock', v_quantity,
    nullif(trim(p_notes), ''), p_device_id
  )
  on conflict (id) do nothing;

  if not found then
    -- A concurrent replay of the same movement already credited this batch.
    return p_batch_id;
  end if;

  update public.inventory_batches
  set quantity_on_hand = v_new_quantity,
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_batch_id and vet_id = v_vet_id and deleted_at is null;

  if not found then
    raise exception 'Inventory batch not found' using errcode = 'P0002';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'inventory.restocked', 'inventory_movement', p_movement_id, null,
    jsonb_build_object(
      'item_id', p_item_id,
      'batch_id', p_batch_id,
      'quantity', v_quantity,
      'expiry_date', p_expiry_date
    )
  );

  return p_batch_id;
end;
$$;

create or replace function public.record_inventory_consumption(
  p_movement_id uuid,
  p_batch_id uuid,
  p_visit_id uuid,
  p_quantity numeric,
  p_notes text default null,
  p_device_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_existing_vet_id uuid;
  v_quantity numeric;
  v_quantity_on_hand numeric(10,2);
  v_new_quantity numeric;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  -- Rounded to the stored scale so the ledger and quantity_on_hand stay exact.
  v_quantity := round(coalesce(p_quantity, 0), 2);

  if v_quantity <= 0 then
    raise exception 'Consumption quantity must be greater than zero' using errcode = '22023';
  end if;

  if p_visit_id is null then
    raise exception 'A consumption movement must reference a visit' using errcode = '22023';
  end if;

  if p_notes is not null and char_length(trim(p_notes)) > 1000 then
    raise exception 'Movement notes are too long' using errcode = '22023';
  end if;

  -- Offline retry guard. This runs before any quantity arithmetic so a replay
  -- returns the original result even when the batch has since been drained.
  select m.vet_id into v_existing_vet_id
  from public.inventory_movements m
  where m.id = p_movement_id;

  if v_existing_vet_id is not null then
    if v_existing_vet_id <> v_vet_id then
      raise exception 'Inventory movement ID is unavailable' using errcode = '42501';
    end if;
    return p_movement_id;
  end if;

  if not exists (
    select 1 from public.visits
    where id = p_visit_id and vet_id = v_vet_id and deleted_at is null
  ) then
    raise exception 'Visit not found' using errcode = 'P0002';
  end if;

  select b.quantity_on_hand
    into v_quantity_on_hand
  from public.inventory_batches b
  where b.id = p_batch_id and b.vet_id = v_vet_id and b.deleted_at is null
  for update;

  if not found then
    raise exception 'Inventory batch not found' using errcode = 'P0002';
  end if;

  v_new_quantity := v_quantity_on_hand - v_quantity;

  -- Raise a clear error rather than letting the quantity_on_hand >= 0 check
  -- constraint fire with an opaque message.
  if v_new_quantity < 0 then
    raise exception 'Insufficient stock in batch to record this consumption' using errcode = '22023';
  end if;

  insert into public.inventory_movements (
    id, vet_id, batch_id, visit_id, movement_type, quantity, notes, created_by_device_id
  ) values (
    p_movement_id, v_vet_id, p_batch_id, p_visit_id, 'consumption', -v_quantity,
    nullif(trim(p_notes), ''), p_device_id
  )
  on conflict (id) do nothing;

  if not found then
    -- A concurrent replay of the same movement already deducted this stock.
    return p_movement_id;
  end if;

  update public.inventory_batches
  set quantity_on_hand = v_new_quantity,
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_batch_id and vet_id = v_vet_id and deleted_at is null;

  if not found then
    raise exception 'Inventory batch not found' using errcode = 'P0002';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'inventory.consumed', 'inventory_movement', p_movement_id, null,
    jsonb_build_object(
      'batch_id', p_batch_id,
      'visit_id', p_visit_id,
      'quantity', v_quantity
    )
  );

  return p_movement_id;
end;
$$;

-- A correction is a new adjustment movement, never an edit of a prior movement.
create or replace function public.adjust_inventory(
  p_movement_id uuid,
  p_batch_id uuid,
  p_quantity_delta numeric,
  p_reason text,
  p_device_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_existing_vet_id uuid;
  v_quantity_delta numeric;
  v_quantity_on_hand numeric(10,2);
  v_new_quantity numeric;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  -- Rounded to the stored scale so the ledger and quantity_on_hand stay exact.
  v_quantity_delta := round(coalesce(p_quantity_delta, 0), 2);

  if v_quantity_delta = 0 then
    raise exception 'Adjustment quantity cannot be zero' using errcode = '22023';
  end if;

  if abs(v_quantity_delta) > 1000000 then
    raise exception 'Adjustment quantity is out of range' using errcode = '22023';
  end if;

  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Adjustment reason is required' using errcode = '22023';
  end if;

  -- The audit trail caps reason at 500 characters; reject early rather than
  -- failing the audit insert after the stock has already moved.
  if char_length(trim(p_reason)) > 500 then
    raise exception 'Adjustment reason is too long' using errcode = '22023';
  end if;

  -- Offline retry guard.
  select m.vet_id into v_existing_vet_id
  from public.inventory_movements m
  where m.id = p_movement_id;

  if v_existing_vet_id is not null then
    if v_existing_vet_id <> v_vet_id then
      raise exception 'Inventory movement ID is unavailable' using errcode = '42501';
    end if;
    return p_movement_id;
  end if;

  select b.quantity_on_hand
    into v_quantity_on_hand
  from public.inventory_batches b
  where b.id = p_batch_id and b.vet_id = v_vet_id and b.deleted_at is null
  for update;

  if not found then
    raise exception 'Inventory batch not found' using errcode = 'P0002';
  end if;

  v_new_quantity := v_quantity_on_hand + v_quantity_delta;

  if v_new_quantity < 0 then
    raise exception 'Adjustment would drive batch stock below zero' using errcode = '22023';
  end if;

  if v_new_quantity > 99999999.99 then
    raise exception 'Batch quantity on hand is out of range' using errcode = '22023';
  end if;

  insert into public.inventory_movements (
    id, vet_id, batch_id, visit_id, movement_type, quantity, notes, created_by_device_id
  ) values (
    p_movement_id, v_vet_id, p_batch_id, null, 'adjustment', v_quantity_delta,
    trim(p_reason), p_device_id
  )
  on conflict (id) do nothing;

  if not found then
    -- A concurrent replay of the same movement already applied this correction.
    return p_movement_id;
  end if;

  update public.inventory_batches
  set quantity_on_hand = v_new_quantity,
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_batch_id and vet_id = v_vet_id and deleted_at is null;

  if not found then
    raise exception 'Inventory batch not found' using errcode = 'P0002';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'inventory.adjusted', 'inventory_movement', p_movement_id, trim(p_reason),
    jsonb_build_object('batch_id', p_batch_id, 'quantity_delta', v_quantity_delta)
  );

  return p_movement_id;
end;
$$;

-- Reconciles an expired batch: availability already excluded it, this zeroes
-- the physical quantity and leaves an auditable ledger row behind.
create or replace function public.write_off_expired_batch(
  p_movement_id uuid,
  p_batch_id uuid,
  p_notes text default null,
  p_device_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_existing_vet_id uuid;
  v_quantity_on_hand numeric(10,2);
  v_expiry_date date;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  if p_notes is not null and char_length(trim(p_notes)) > 1000 then
    raise exception 'Movement notes are too long' using errcode = '22023';
  end if;

  -- Offline retry guard. Runs first so a replay does not trip the "no stock
  -- left to write off" check that the original call created.
  select m.vet_id into v_existing_vet_id
  from public.inventory_movements m
  where m.id = p_movement_id;

  if v_existing_vet_id is not null then
    if v_existing_vet_id <> v_vet_id then
      raise exception 'Inventory movement ID is unavailable' using errcode = '42501';
    end if;
    return p_movement_id;
  end if;

  select b.quantity_on_hand, b.expiry_date
    into v_quantity_on_hand, v_expiry_date
  from public.inventory_batches b
  where b.id = p_batch_id and b.vet_id = v_vet_id and b.deleted_at is null
  for update;

  if not found then
    raise exception 'Inventory batch not found' using errcode = 'P0002';
  end if;

  if v_expiry_date is null or v_expiry_date >= current_date then
    raise exception 'Batch has not expired' using errcode = '22023';
  end if;

  if v_quantity_on_hand <= 0 then
    raise exception 'Batch has no remaining stock to write off' using errcode = '22023';
  end if;

  insert into public.inventory_movements (
    id, vet_id, batch_id, visit_id, movement_type, quantity, notes, created_by_device_id
  ) values (
    p_movement_id, v_vet_id, p_batch_id, null, 'expired_writeoff', -v_quantity_on_hand,
    nullif(trim(p_notes), ''), p_device_id
  )
  on conflict (id) do nothing;

  if not found then
    -- A concurrent replay of the same movement already wrote this batch off.
    return p_movement_id;
  end if;

  update public.inventory_batches
  set quantity_on_hand = 0,
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_batch_id and vet_id = v_vet_id and deleted_at is null;

  if not found then
    raise exception 'Inventory batch not found' using errcode = 'P0002';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'inventory.expired_written_off', 'inventory_movement', p_movement_id, null,
    jsonb_build_object(
      'batch_id', p_batch_id,
      'quantity', v_quantity_on_hand,
      'expiry_date', v_expiry_date
    )
  );

  return p_movement_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.inventory_items enable row level security;
alter table public.inventory_batches enable row level security;
alter table public.inventory_movements enable row level security;

create policy inventory_items_select_own
on public.inventory_items
for select
to authenticated
using (vet_id = app_private.current_vet_id() and auth.jwt() ->> 'aal' = 'aal2');

create policy inventory_batches_select_own
on public.inventory_batches
for select
to authenticated
using (vet_id = app_private.current_vet_id() and auth.jwt() ->> 'aal' = 'aal2');

create policy inventory_movements_select_own
on public.inventory_movements
for select
to authenticated
using (vet_id = app_private.current_vet_id() and auth.jwt() ->> 'aal' = 'aal2');

revoke all on public.inventory_items from anon, authenticated;
revoke all on public.inventory_batches from anon, authenticated;
revoke all on public.inventory_movements from anon, authenticated;
revoke all on public.inventory_item_stock from anon, authenticated;

grant select on public.inventory_items to authenticated;
grant select on public.inventory_batches to authenticated;
grant select on public.inventory_movements to authenticated;
grant select on public.inventory_item_stock to authenticated;

grant execute on function public.inventory_available_quantity(uuid) to authenticated;
grant execute on function public.create_inventory_item(uuid, text, text, text, numeric, uuid) to authenticated;
grant execute on function public.update_inventory_item(uuid, text, text, text, numeric, boolean, uuid) to authenticated;
grant execute on function public.restock_inventory_batch(uuid, uuid, uuid, numeric, text, date, bigint, timestamptz, text, uuid) to authenticated;
grant execute on function public.record_inventory_consumption(uuid, uuid, uuid, numeric, text, uuid) to authenticated;
grant execute on function public.adjust_inventory(uuid, uuid, numeric, text, uuid) to authenticated;
grant execute on function public.write_off_expired_batch(uuid, uuid, text, uuid) to authenticated;

revoke execute on function public.inventory_available_quantity(uuid) from public, anon;
revoke execute on function public.create_inventory_item(uuid, text, text, text, numeric, uuid) from public, anon;
revoke execute on function public.update_inventory_item(uuid, text, text, text, numeric, boolean, uuid) from public, anon;
revoke execute on function public.restock_inventory_batch(uuid, uuid, uuid, numeric, text, date, bigint, timestamptz, text, uuid) from public, anon;
revoke execute on function public.record_inventory_consumption(uuid, uuid, uuid, numeric, text, uuid) from public, anon;
revoke execute on function public.adjust_inventory(uuid, uuid, numeric, text, uuid) from public, anon;
revoke execute on function public.write_off_expired_batch(uuid, uuid, text, uuid) from public, anon;

revoke all on function app_private.prevent_inventory_movement_mutation() from public, anon, authenticated;
