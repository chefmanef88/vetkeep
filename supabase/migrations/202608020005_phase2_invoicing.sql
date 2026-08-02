-- VetKeep Phase 2 Billing Layer 2: the veterinarian's own invoices to their clients.
--
-- VetKeep records this money. It does not process it, hold it, or take a percentage
-- of it (brief section 14). No payment provider, webhook, or settlement logic belongs
-- in this migration; money changes hands outside VetKeep and is merely written down.
--
-- Conventions carried forward from Phase 1 and 202608020001:
--   * client roles get SELECT only, every mutation goes through a SECURITY DEFINER RPC;
--   * row identifiers are client-generated so a retried offline sync is idempotent;
--   * money is integer pesewas (bigint), never floating point (brief section 4.3);
--   * totals and status are derived by app_private.recalculate_invoice_totals() and are
--     never accepted from a caller;
--   * completed invoices and payment records are voided with a reason, never erased
--     (brief section 8.2).

create table public.visit_invoices (
  id uuid primary key,
  vet_id uuid not null references public.vets(id) on delete restrict,
  visit_id uuid references public.visits(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  invoice_number text not null check (char_length(trim(invoice_number)) between 1 and 40),
  currency text not null default 'GHS' check (currency ~ '^[A-Z]{3}$'),
  subtotal_pesewas bigint not null default 0 check (subtotal_pesewas >= 0),
  discount_pesewas bigint not null default 0 check (discount_pesewas >= 0),
  total_pesewas bigint not null default 0 check (total_pesewas >= 0),
  amount_paid_pesewas bigint not null default 0 check (amount_paid_pesewas >= 0),
  -- Invoices are raised as drafts and become 'unpaid' only when they are issued.
  status text not null default 'draft'
    check (status in ('draft', 'unpaid', 'partial', 'paid', 'voided')),
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  void_reason text check (void_reason is null or char_length(trim(void_reason)) between 3 and 500),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1 check (server_version > 0),
  created_by_device_id uuid references public.vet_devices(id) on delete set null,
  last_modified_by_device_id uuid references public.vet_devices(id) on delete set null,
  unique (vet_id, invoice_number),
  -- Last line of defence behind recalculate_invoice_totals(). The RPCs raise a clear
  -- error before any of these can fire raw.
  check (amount_paid_pesewas <= total_pesewas),
  check (status <> 'voided' or void_reason is not null),
  check (status in ('draft', 'voided') or issued_at is not null),
  check (status <> 'paid' or paid_at is not null)
);

create table public.invoice_items (
  id uuid primary key,
  vet_id uuid not null references public.vets(id) on delete restrict,
  -- 'restrict' rather than 'cascade': invoices are never hard-deleted (brief 8.2),
  -- so a cascade would only ever mask a bug.
  invoice_id uuid not null references public.visit_invoices(id) on delete restrict,
  description text not null check (char_length(trim(description)) between 1 and 300),
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_price_pesewas bigint not null check (unit_price_pesewas >= 0),
  line_total_pesewas bigint not null check (line_total_pesewas >= 0),
  sequence_number integer not null check (sequence_number > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1 check (server_version > 0),
  created_by_device_id uuid references public.vet_devices(id) on delete set null,
  last_modified_by_device_id uuid references public.vet_devices(id) on delete set null
);

create table public.invoice_payments (
  id uuid primary key,
  vet_id uuid not null references public.vets(id) on delete restrict,
  invoice_id uuid not null references public.visit_invoices(id) on delete restrict,
  amount_pesewas bigint not null check (amount_pesewas > 0),
  -- Every method describes money that moved outside VetKeep.
  method text not null
    check (method in ('cash', 'momo', 'bank_transfer', 'card_external', 'other')),
  reference text check (reference is null or char_length(trim(reference)) between 1 and 120),
  paid_at timestamptz not null,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1 check (server_version > 0),
  created_by_device_id uuid references public.vet_devices(id) on delete set null,
  last_modified_by_device_id uuid references public.vet_devices(id) on delete set null
);

comment on table public.visit_invoices is
  'Billing Layer 2: the veterinarian''s invoices to their own clients. VetKeep records this money only; it never processes, holds, or takes a percentage of it. Totals and status are server-derived.';
comment on table public.invoice_items is
  'Invoice line items. line_total_pesewas is derived server-side from quantity and unit price and is never accepted from a caller.';
comment on table public.invoice_payments is
  'Payments the veterinarian received directly from a client, outside VetKeep. Append-only in practice: the client-generated id makes a retried offline sync idempotent.';

comment on column public.visit_invoices.amount_paid_pesewas is
  'Derived: sum of live invoice_payments. Never written by an RPC caller.';
comment on column public.visit_invoices.status is
  'Derived from issued_at, total_pesewas, and amount_paid_pesewas. Never written by an RPC caller except through void_invoice.';

create unique index invoice_items_sequence_idx
  on public.invoice_items (invoice_id, sequence_number)
  where deleted_at is null;

create index visit_invoices_vet_id_idx on public.visit_invoices (vet_id) where deleted_at is null;
create index visit_invoices_client_idx on public.visit_invoices (client_id) where deleted_at is null;
create index visit_invoices_visit_idx on public.visit_invoices (visit_id) where visit_id is not null;
create index visit_invoices_status_idx on public.visit_invoices (vet_id, status) where deleted_at is null;
create index visit_invoices_issued_at_idx on public.visit_invoices (vet_id, issued_at desc);

create index invoice_items_vet_id_idx on public.invoice_items (vet_id);
create index invoice_items_invoice_idx on public.invoice_items (invoice_id) where deleted_at is null;

create index invoice_payments_vet_id_idx on public.invoice_payments (vet_id);
create index invoice_payments_invoice_idx on public.invoice_payments (invoice_id) where deleted_at is null;
create index invoice_payments_paid_at_idx on public.invoice_payments (vet_id, paid_at desc);

create trigger visit_invoices_set_row_version
before update on public.visit_invoices
for each row execute function app_private.set_row_version();

create trigger invoice_items_set_row_version
before update on public.invoice_items
for each row execute function app_private.set_row_version();

create trigger invoice_payments_set_row_version
before update on public.invoice_payments
for each row execute function app_private.set_row_version();

-- ---------------------------------------------------------------------------
-- Tenant integrity (brief section 9.3)
-- ---------------------------------------------------------------------------

-- An invoice must belong to the same veterinarian as the client and visit it points at,
-- and its vet_id is immutable.
create or replace function app_private.enforce_invoice_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_client_vet_id uuid;
  v_visit_vet_id uuid;
begin
  if tg_op = 'UPDATE' then
    if new.vet_id <> old.vet_id then
      raise exception 'An invoice cannot be reassigned to another veterinarian' using errcode = '42501';
    end if;

    if new.client_id = old.client_id and new.visit_id is not distinct from old.visit_id then
      return new;
    end if;
  end if;

  select c.vet_id into v_client_vet_id
  from public.clients c
  where c.id = new.client_id;

  if v_client_vet_id is null or v_client_vet_id <> new.vet_id then
    raise exception 'An invoice must belong to the same veterinarian as its client' using errcode = '42501';
  end if;

  if new.visit_id is not null then
    select v.vet_id into v_visit_vet_id
    from public.visits v
    where v.id = new.visit_id;

    if v_visit_vet_id is null or v_visit_vet_id <> new.vet_id then
      raise exception 'An invoice must belong to the same veterinarian as its visit' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- Invoice items and payments must belong to the same veterinarian as their invoice,
-- and can never be moved to another tenant or another invoice.
create or replace function app_private.enforce_invoice_child_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_invoice_vet_id uuid;
begin
  if tg_op = 'UPDATE'
     and (new.vet_id <> old.vet_id or new.invoice_id <> old.invoice_id) then
    raise exception 'Invoice child records cannot be reassigned to another veterinarian or invoice' using errcode = '42501';
  end if;

  select i.vet_id into v_invoice_vet_id
  from public.visit_invoices i
  where i.id = new.invoice_id;

  if v_invoice_vet_id is null or v_invoice_vet_id <> new.vet_id then
    raise exception 'Invoice child records must belong to the same veterinarian as their invoice' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Brief section 8.2: completed invoices and payment records cannot be hard-deleted.
-- The tenant role holds no DELETE privilege at all; this trigger also stops an
-- elevated or service-role session from erasing financial history by accident.
create or replace function app_private.prevent_financial_record_deletion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Invoices, invoice items, and payment records cannot be hard-deleted' using errcode = '42501';
end;
$$;

create trigger visit_invoices_tenant_consistency
before insert or update on public.visit_invoices
for each row execute function app_private.enforce_invoice_tenant();

create trigger invoice_items_tenant_consistency
before insert or update on public.invoice_items
for each row execute function app_private.enforce_invoice_child_tenant();

create trigger invoice_payments_tenant_consistency
before insert or update on public.invoice_payments
for each row execute function app_private.enforce_invoice_child_tenant();

create trigger visit_invoices_no_hard_delete
before delete on public.visit_invoices
for each row execute function app_private.prevent_financial_record_deletion();

create trigger invoice_items_no_hard_delete
before delete on public.invoice_items
for each row execute function app_private.prevent_financial_record_deletion();

create trigger invoice_payments_no_hard_delete
before delete on public.invoice_payments
for each row execute function app_private.prevent_financial_record_deletion();

-- ---------------------------------------------------------------------------
-- Trusted total and status derivation
-- ---------------------------------------------------------------------------

-- The single writer of subtotal_pesewas, total_pesewas, amount_paid_pesewas, and
-- status. Every RPC that changes an item or a payment must call this afterwards.
-- Nothing here is taken from the caller: the figures are summed from the live rows.
create or replace function app_private.recalculate_invoice_totals(
  p_invoice_id uuid,
  p_device_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text;
  v_issued_at timestamptz;
  v_discount bigint;
  v_subtotal bigint;
  v_total bigint;
  v_paid bigint;
  v_last_paid_at timestamptz;
begin
  select i.status, i.issued_at, i.discount_pesewas
    into v_status, v_issued_at, v_discount
  from public.visit_invoices i
  where i.id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;

  select coalesce(sum(it.line_total_pesewas), 0)
    into v_subtotal
  from public.invoice_items it
  where it.invoice_id = p_invoice_id and it.deleted_at is null;

  select coalesce(sum(pm.amount_pesewas), 0), max(pm.paid_at)
    into v_paid, v_last_paid_at
  from public.invoice_payments pm
  where pm.invoice_id = p_invoice_id and pm.deleted_at is null;

  v_total := greatest(v_subtotal - v_discount, 0);

  -- Raised in preference to letting the amount_paid_pesewas <= total_pesewas check
  -- constraint fire raw, e.g. when removing an item from a part-paid invoice.
  if v_paid > v_total then
    raise exception 'Recalculated invoice total is below the amount already paid' using errcode = '22023';
  end if;

  if v_status = 'voided' then
    -- A voided invoice keeps its historical figures and never re-enters the payment cycle.
    null;
  elsif v_issued_at is null then
    v_status := 'draft';
  elsif v_paid = 0 then
    v_status := 'unpaid';
  elsif v_paid >= v_total then
    v_status := 'paid';
  else
    v_status := 'partial';
  end if;

  update public.visit_invoices
  set subtotal_pesewas = v_subtotal,
      total_pesewas = v_total,
      amount_paid_pesewas = v_paid,
      status = v_status,
      paid_at = case
        when v_status = 'paid' then v_last_paid_at
        when v_status = 'voided' then paid_at
        else null
      end,
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_invoice_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------

create or replace function public.create_invoice(
  p_id uuid,
  p_client_id uuid,
  p_invoice_number text,
  p_visit_id uuid default null,
  p_currency text default 'GHS',
  p_discount_pesewas bigint default 0,
  p_due_at timestamptz default null,
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
  v_invoice_number text;
  v_currency text;
  v_discount bigint;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  v_invoice_number := nullif(trim(p_invoice_number), '');
  if v_invoice_number is null or char_length(v_invoice_number) > 40 then
    raise exception 'Invalid invoice number' using errcode = '22023';
  end if;

  v_currency := upper(coalesce(nullif(trim(p_currency), ''), 'GHS'));
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Invalid currency code' using errcode = '22023';
  end if;

  v_discount := coalesce(p_discount_pesewas, 0);
  if v_discount < 0 then
    raise exception 'Discount cannot be negative' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.clients
    where id = p_client_id and vet_id = v_vet_id and deleted_at is null
  ) then
    raise exception 'Client not found' using errcode = 'P0002';
  end if;

  if p_visit_id is not null and not exists (
    select 1 from public.visits
    where id = p_visit_id and vet_id = v_vet_id
  ) then
    raise exception 'Visit not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.visit_invoices
    where vet_id = v_vet_id and invoice_number = v_invoice_number and id <> p_id
  ) then
    raise exception 'Invoice number is already in use' using errcode = '22023';
  end if;

  -- No subtotal, total, amount paid, or status parameter exists by design: those
  -- are derived server-side only.
  insert into public.visit_invoices (
    id, vet_id, visit_id, client_id, invoice_number, currency,
    discount_pesewas, due_at, notes,
    created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, p_visit_id, p_client_id, v_invoice_number, v_currency,
    v_discount, p_due_at, nullif(trim(p_notes), ''),
    p_device_id, p_device_id
  )
  on conflict (id) do nothing;

  if not found then
    if exists (select 1 from public.visit_invoices where id = p_id and vet_id = v_vet_id) then
      return p_id;
    end if;
    raise exception 'Invoice ID is unavailable' using errcode = '42501';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'invoice.created', 'visit_invoice', p_id, null,
    jsonb_build_object(
      'invoice_number', v_invoice_number,
      'currency', v_currency,
      'client_id', p_client_id,
      'visit_id', p_visit_id
    )
  );

  return p_id;
end;
$$;

create or replace function public.issue_invoice(
  p_id uuid,
  p_due_at timestamptz default null,
  p_device_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_status text;
  v_issued_at timestamptz;
  v_item_count integer;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  select i.status, i.issued_at
    into v_status, v_issued_at
  from public.visit_invoices i
  where i.id = p_id and i.vet_id = v_vet_id and i.deleted_at is null
  for update;

  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;

  if v_status = 'voided' then
    raise exception 'Voided invoices cannot be issued' using errcode = '22023';
  end if;

  if v_issued_at is not null then
    -- Already issued; a retried offline sync is a no-op.
    return;
  end if;

  select count(*)::integer into v_item_count
  from public.invoice_items
  where invoice_id = p_id and deleted_at is null;

  if v_item_count = 0 then
    raise exception 'An invoice must have at least one item before it is issued' using errcode = '22023';
  end if;

  update public.visit_invoices
  set issued_at = now(),
      due_at = coalesce(p_due_at, due_at),
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_id;

  perform app_private.recalculate_invoice_totals(p_id, p_device_id);

  perform app_private.insert_audit_event(
    v_vet_id, 'invoice.issued', 'visit_invoice', p_id, null,
    jsonb_build_object('item_count', v_item_count)
  );
end;
$$;

-- An erroneous invoice is voided with a reason, never erased (brief section 8.2).
-- Any payments already recorded are preserved exactly as they were.
create or replace function public.void_invoice(
  p_id uuid,
  p_reason text,
  p_device_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_status text;
  v_paid bigint;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  if coalesce(char_length(trim(p_reason)), 0) < 3 then
    raise exception 'Void reason is required' using errcode = '22023';
  end if;

  if char_length(trim(p_reason)) > 500 then
    raise exception 'Void reason is too long' using errcode = '22023';
  end if;

  select i.status, i.amount_paid_pesewas
    into v_status, v_paid
  from public.visit_invoices i
  where i.id = p_id and i.vet_id = v_vet_id and i.deleted_at is null
  for update;

  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;

  if v_status = 'voided' then
    -- Already voided; a retried offline sync is a no-op.
    return;
  end if;

  update public.visit_invoices
  set status = 'voided',
      void_reason = trim(p_reason),
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_id;

  -- Keep recalculate_invoice_totals() the single writer of the derived figures.
  -- It preserves the voided status and the historical totals and payments.
  perform app_private.recalculate_invoice_totals(p_id, p_device_id);

  perform app_private.insert_audit_event(
    v_vet_id, 'invoice.voided', 'visit_invoice', p_id, trim(p_reason),
    jsonb_build_object('previous_status', v_status, 'amount_paid_pesewas', v_paid)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Invoice items
-- ---------------------------------------------------------------------------

create or replace function public.add_invoice_item(
  p_id uuid,
  p_invoice_id uuid,
  p_description text,
  p_quantity numeric,
  p_unit_price_pesewas bigint,
  p_sequence_number integer default null,
  p_device_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_status text;
  v_description text;
  v_quantity numeric(10,2);
  v_line_total bigint;
  v_sequence integer;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  v_description := nullif(trim(p_description), '');
  if v_description is null or char_length(v_description) > 300 then
    raise exception 'Invalid invoice item description' using errcode = '22023';
  end if;

  v_quantity := round(coalesce(p_quantity, 0), 2);
  if v_quantity <= 0 then
    raise exception 'Invoice item quantity must be greater than zero' using errcode = '22023';
  end if;

  if coalesce(p_unit_price_pesewas, -1) < 0 then
    raise exception 'Invoice item unit price cannot be negative' using errcode = '22023';
  end if;

  select i.status into v_status
  from public.visit_invoices i
  where i.id = p_invoice_id and i.vet_id = v_vet_id and i.deleted_at is null
  for update;

  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;

  if v_status in ('paid', 'voided') then
    raise exception 'Paid or voided invoices cannot be modified' using errcode = '22023';
  end if;

  -- Rounding decision: quantity is numeric(10,2) and unit price is whole pesewas, so
  -- the product can be fractional (e.g. 1.5 x 333). The arithmetic is exact numeric
  -- (never floating point) and the line total is rounded half-up to the nearest whole
  -- pesewa. Rounding happens once, per line, before any total is summed.
  v_line_total := round(v_quantity * p_unit_price_pesewas)::bigint;

  select coalesce(p_sequence_number, coalesce(max(it.sequence_number), 0) + 1)
    into v_sequence
  from public.invoice_items it
  where it.invoice_id = p_invoice_id and it.deleted_at is null;

  insert into public.invoice_items (
    id, vet_id, invoice_id, description, quantity,
    unit_price_pesewas, line_total_pesewas, sequence_number,
    created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, p_invoice_id, v_description, v_quantity,
    p_unit_price_pesewas, v_line_total, v_sequence,
    p_device_id, p_device_id
  )
  on conflict (id) do nothing;

  if not found then
    if exists (select 1 from public.invoice_items where id = p_id and vet_id = v_vet_id) then
      return p_id;
    end if;
    raise exception 'Invoice item ID is unavailable' using errcode = '42501';
  end if;

  perform app_private.recalculate_invoice_totals(p_invoice_id, p_device_id);

  perform app_private.insert_audit_event(
    v_vet_id, 'invoice_item.added', 'invoice_item', p_id, null,
    jsonb_build_object('invoice_id', p_invoice_id, 'line_total_pesewas', v_line_total)
  );

  return p_id;
end;
$$;

create or replace function public.remove_invoice_item(
  p_id uuid,
  p_reason text default null,
  p_device_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_invoice_id uuid;
  v_status text;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  select it.invoice_id into v_invoice_id
  from public.invoice_items it
  where it.id = p_id and it.vet_id = v_vet_id and it.deleted_at is null;

  if not found then
    if exists (select 1 from public.invoice_items where id = p_id and vet_id = v_vet_id) then
      -- Already removed; a retried offline sync is a no-op.
      return;
    end if;
    raise exception 'Invoice item not found' using errcode = 'P0002';
  end if;

  select i.status into v_status
  from public.visit_invoices i
  where i.id = v_invoice_id
  for update;

  if v_status in ('paid', 'voided') then
    raise exception 'Paid or voided invoices cannot be modified' using errcode = '22023';
  end if;

  update public.invoice_items
  set deleted_at = now(),
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_id and vet_id = v_vet_id and deleted_at is null;

  -- Raises if the reduced total would fall below what has already been paid.
  perform app_private.recalculate_invoice_totals(v_invoice_id, p_device_id);

  perform app_private.insert_audit_event(
    v_vet_id, 'invoice_item.removed', 'invoice_item', p_id, nullif(trim(p_reason), ''),
    jsonb_build_object('invoice_id', v_invoice_id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

-- Records money the veterinarian has already received from the client, outside
-- VetKeep. The client-generated p_id is the idempotency key for a retried sync.
create or replace function public.record_invoice_payment(
  p_id uuid,
  p_invoice_id uuid,
  p_amount_pesewas bigint,
  p_method text,
  p_paid_at timestamptz default null,
  p_reference text default null,
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
  v_status text;
  v_total bigint;
  v_paid bigint;
  v_outstanding bigint;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  -- Resolve a replayed payment BEFORE any balance arithmetic. A retry carries the
  -- same client-generated id; if it were allowed to reach the balance check it would
  -- either be rejected as an overpayment or, worse, be counted twice.
  if exists (select 1 from public.invoice_payments where id = p_id) then
    if exists (select 1 from public.invoice_payments where id = p_id and vet_id = v_vet_id) then
      return p_id;
    end if;
    raise exception 'Payment ID is unavailable' using errcode = '42501';
  end if;

  if coalesce(p_amount_pesewas, 0) <= 0 then
    raise exception 'Payment amount must be greater than zero' using errcode = '22023';
  end if;

  if p_method is null
     or p_method not in ('cash', 'momo', 'bank_transfer', 'card_external', 'other') then
    raise exception 'Invalid payment method' using errcode = '22023';
  end if;

  select i.status, i.total_pesewas, i.amount_paid_pesewas
    into v_status, v_total, v_paid
  from public.visit_invoices i
  where i.id = p_invoice_id and i.vet_id = v_vet_id and i.deleted_at is null
  for update;

  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;

  if v_status = 'voided' then
    raise exception 'Voided invoices cannot receive payments' using errcode = '22023';
  end if;

  if v_status = 'draft' then
    raise exception 'Invoice must be issued before recording a payment' using errcode = '22023';
  end if;

  v_outstanding := v_total - v_paid;
  if p_amount_pesewas > v_outstanding then
    raise exception 'Payment exceeds the outstanding invoice balance' using errcode = '22023';
  end if;

  insert into public.invoice_payments (
    id, vet_id, invoice_id, amount_pesewas, method, reference, paid_at, notes,
    created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, p_invoice_id, p_amount_pesewas, p_method,
    nullif(trim(p_reference), ''), coalesce(p_paid_at, now()), nullif(trim(p_notes), ''),
    p_device_id, p_device_id
  )
  on conflict (id) do nothing;

  if not found then
    if exists (select 1 from public.invoice_payments where id = p_id and vet_id = v_vet_id) then
      return p_id;
    end if;
    raise exception 'Payment ID is unavailable' using errcode = '42501';
  end if;

  perform app_private.recalculate_invoice_totals(p_invoice_id, p_device_id);

  perform app_private.insert_audit_event(
    v_vet_id, 'invoice_payment.recorded', 'invoice_payment', p_id, null,
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'amount_pesewas', p_amount_pesewas,
      'method', p_method
    )
  );

  return p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.visit_invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.invoice_payments enable row level security;

create policy visit_invoices_select_own
on public.visit_invoices
for select
to authenticated
using (vet_id = app_private.current_vet_id() and auth.jwt() ->> 'aal' = 'aal2');

create policy invoice_items_select_own
on public.invoice_items
for select
to authenticated
using (vet_id = app_private.current_vet_id() and auth.jwt() ->> 'aal' = 'aal2');

create policy invoice_payments_select_own
on public.invoice_payments
for select
to authenticated
using (vet_id = app_private.current_vet_id() and auth.jwt() ->> 'aal' = 'aal2');

revoke all on public.visit_invoices from anon, authenticated;
revoke all on public.invoice_items from anon, authenticated;
revoke all on public.invoice_payments from anon, authenticated;

grant select on public.visit_invoices to authenticated;
grant select on public.invoice_items to authenticated;
grant select on public.invoice_payments to authenticated;

grant execute on function public.create_invoice(uuid, uuid, text, uuid, text, bigint, timestamptz, text, uuid) to authenticated;
grant execute on function public.issue_invoice(uuid, timestamptz, uuid) to authenticated;
grant execute on function public.void_invoice(uuid, text, uuid) to authenticated;
grant execute on function public.add_invoice_item(uuid, uuid, text, numeric, bigint, integer, uuid) to authenticated;
grant execute on function public.remove_invoice_item(uuid, text, uuid) to authenticated;
grant execute on function public.record_invoice_payment(uuid, uuid, bigint, text, timestamptz, text, text, uuid) to authenticated;

revoke execute on function public.create_invoice(uuid, uuid, text, uuid, text, bigint, timestamptz, text, uuid) from public, anon;
revoke execute on function public.issue_invoice(uuid, timestamptz, uuid) from public, anon;
revoke execute on function public.void_invoice(uuid, text, uuid) from public, anon;
revoke execute on function public.add_invoice_item(uuid, uuid, text, numeric, bigint, integer, uuid) from public, anon;
revoke execute on function public.remove_invoice_item(uuid, text, uuid) from public, anon;
revoke execute on function public.record_invoice_payment(uuid, uuid, bigint, text, timestamptz, text, text, uuid) from public, anon;

-- Derivation and integrity helpers are server-side only; no client role may call them.
revoke all on function app_private.recalculate_invoice_totals(uuid, uuid) from public, anon, authenticated;
revoke all on function app_private.enforce_invoice_tenant() from public, anon, authenticated;
revoke all on function app_private.enforce_invoice_child_tenant() from public, anon, authenticated;
revoke all on function app_private.prevent_financial_record_deletion() from public, anon, authenticated;
