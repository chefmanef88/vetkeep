-- Phase 4: reminders and the messaging outbox (brief §12).
--
-- What is worth reminding a client about is a due date the veterinarian
-- recorded: a follow-up, a vaccination coming due, or a withholding period
-- ending. Each is a fact the vet asserted, which is why it can be sent without
-- any booking existing (§11).
--
-- Two things this migration does NOT do, stated plainly so nobody assumes
-- otherwise from the presence of the table:
--
--   Nothing is sent. Delivery needs WhatsApp Business API credentials, which do
--   not exist yet. What is built is the queue, the rules that fill it, and the
--   rules that empty it when the reason disappears. A worker drains it when
--   there is somewhere to drain it to.
--
--   Because nothing is sent, every row sits at 'queued'. That is the honest
--   state, not a bug. The veterinarian can see what is due and telephone.
--
-- The outbox shape is per §12.2 rather than a `sent boolean`: a status machine,
-- an attempt count, an idempotency key, and room for provider identifiers and
-- errors. Getting that shape right now costs nothing; retrofitting it onto a
-- boolean after the first failed send costs a migration and a lost message.

create table if not exists public.client_reminders (
  id uuid primary key default gen_random_uuid(),
  vet_id uuid not null references public.vets(id) on delete restrict,

  reminder_type text not null
    check (reminder_type in ('follow_up', 'vaccination_due', 'withdrawal_ends')),

  -- Exactly one target. The reminder dies with whatever it was reminding about.
  visit_id uuid references public.visits(id) on delete cascade,
  preventive_care_id uuid references public.preventive_care(id) on delete cascade,
  treatment_id uuid references public.treatments(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,

  send_at timestamptz not null,
  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  template_key text not null,
  template_version text not null default 'v1',
  recipient_e164 text not null,

  status text not null default 'queued'
    check (status in ('queued', 'processing', 'sent', 'delivered', 'read', 'failed', 'cancelled')),
  provider_message_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error_code text,
  last_error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,

  -- Deterministic, so the same due date cannot queue twice however many times
  -- the record is saved or a sync is replayed.
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The brief writes this constraint against a column named vaccination_id,
  -- which does not exist: vaccinations became preventive_care on 11 August and
  -- the constraint was not updated with them.
  constraint client_reminders_one_target check (
    (visit_id is not null)::int
    + (preventive_care_id is not null)::int
    + (treatment_id is not null)::int = 1
  )
);

create index if not exists client_reminders_due_idx
  on public.client_reminders (status, send_at)
  where status = 'queued';

create index if not exists client_reminders_vet_idx
  on public.client_reminders (vet_id, send_at desc);

comment on table public.client_reminders is
  'Outbox for client reminders (§12). Nothing sends yet: delivery needs '
  'WhatsApp Business API credentials. Rows sit at queued, which is the honest '
  'state, and the veterinarian can see what is due and telephone.';

alter table public.client_reminders enable row level security;

drop policy if exists client_reminders_select_own on public.client_reminders;
create policy client_reminders_select_own
on public.client_reminders
for select
to authenticated
using (vet_id = app_private.current_vet_id() and auth.jwt() ->> 'aal' = 'aal2');

revoke all on public.client_reminders from anon, authenticated;
grant select on public.client_reminders to authenticated;

-- ---------------------------------------------------------------------------
-- Who a reminder would reach
-- ---------------------------------------------------------------------------

-- Consent is enforced here rather than at send time (§12.2). A client who has
-- not consented never has a row created, so there is nothing to leak, nothing
-- to accidentally drain, and no queue of messages waiting on a permission
-- nobody gave.
create or replace function app_private.reminder_recipient(p_patient_id uuid)
returns text
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce(c.whatsapp_e164, c.phone_e164)
  from public.patient_owners po
  join public.clients c on c.id = po.client_id
  where po.patient_id = p_patient_id
    and po.is_primary
    and po.valid_to is null
    and po.deleted_at is null
    and c.deleted_at is null
    and c.communication_consent = true
  limit 1
$$;

revoke all on function app_private.reminder_recipient(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Queueing and cancelling
-- ---------------------------------------------------------------------------

create or replace function app_private.queue_reminder(
  p_vet_id uuid,
  p_patient_id uuid,
  p_type text,
  p_send_at timestamptz,
  p_template_key text,
  p_idempotency_key text,
  p_visit_id uuid default null,
  p_preventive_care_id uuid default null,
  p_treatment_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_recipient text;
begin
  v_recipient := app_private.reminder_recipient(p_patient_id);

  -- No consent, or no reachable number: no reminder. Not an error — most of a
  -- practice may never consent, and that is their right.
  if v_recipient is null then
    return;
  end if;

  insert into public.client_reminders (
    vet_id, reminder_type, visit_id, preventive_care_id, treatment_id, patient_id,
    send_at, template_key, recipient_e164, idempotency_key
  ) values (
    p_vet_id, p_type, p_visit_id, p_preventive_care_id, p_treatment_id, p_patient_id,
    p_send_at, p_template_key, v_recipient, p_idempotency_key
  )
  on conflict (idempotency_key) do update
  -- The due date moved. Re-aim the existing reminder rather than queue a second
  -- one, but never disturb a message already on its way out.
  set send_at = excluded.send_at,
      recipient_e164 = excluded.recipient_e164,
      updated_at = now()
  where public.client_reminders.status = 'queued';
end;
$$;

revoke all on function app_private.queue_reminder(
  uuid, uuid, text, timestamptz, text, text, uuid, uuid, uuid
) from public, anon, authenticated;

create or replace function app_private.cancel_reminders_for(
  p_visit_id uuid default null,
  p_preventive_care_id uuid default null,
  p_treatment_id uuid default null
)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  update public.client_reminders
  set status = 'cancelled', updated_at = now()
  where status = 'queued'
    and (
      (p_visit_id is not null and visit_id = p_visit_id)
      or (p_preventive_care_id is not null and preventive_care_id = p_preventive_care_id)
      or (p_treatment_id is not null and treatment_id = p_treatment_id)
    );
$$;

revoke all on function app_private.cancel_reminders_for(uuid, uuid, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- What creates them
-- ---------------------------------------------------------------------------

-- Signing a record and queueing the reminders it implies happen in one
-- transaction (§12.2), which is what a trigger gives for free.
create or replace function app_private.sync_follow_up_reminder()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- A draft is not a promise. Only a signed record's review date is a fact the
  -- veterinarian has asserted.
  if new.workflow_status = 'completed' and new.next_review_date is not null
     and new.deleted_at is null then
    perform app_private.queue_reminder(
      new.vet_id, new.patient_id, 'follow_up',
      (new.next_review_date::timestamp at time zone 'UTC') + interval '8 hours',
      'follow_up_due',
      'follow_up:' || new.id::text,
      new.id, null, null
    );
  else
    -- Voided, deleted, or the review date removed: the reason is gone.
    perform app_private.cancel_reminders_for(new.id, null, null);
  end if;

  return new;
end;
$$;

drop trigger if exists visits_sync_reminders on public.visits;
create trigger visits_sync_reminders
after insert or update on public.visits
for each row execute function app_private.sync_follow_up_reminder();

create or replace function app_private.sync_preventive_reminder()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_send timestamptz;
begin
  if new.next_due_date is not null and new.deleted_at is null then
    -- A week's warning, because a dose due on Friday is no use announced on
    -- Friday. Never in the past: a due date already inside the window is
    -- something the client should hear about now.
    v_send := greatest(
      (new.next_due_date::timestamp at time zone 'UTC') - interval '7 days',
      now()
    );

    perform app_private.queue_reminder(
      new.vet_id, new.patient_id, 'vaccination_due', v_send,
      case new.kind
        when 'vaccination' then 'vaccination_due'
        when 'deworming' then 'deworming_due'
        else 'parasite_control_due'
      end,
      'preventive:' || new.id::text,
      null, new.id, null
    );
  else
    perform app_private.cancel_reminders_for(null, new.id, null);
  end if;

  return new;
end;
$$;

drop trigger if exists preventive_care_sync_reminders on public.preventive_care;
create trigger preventive_care_sync_reminders
after insert or update on public.preventive_care
for each row execute function app_private.sync_preventive_reminder();

create or replace function app_private.sync_withdrawal_reminder()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_last date;
begin
  -- The longest of them governs: milk may clear a fortnight before meat, and
  -- the animal is not free of the treatment until the last one passes.
  v_last := greatest(
    coalesce(new.meat_withhold_until, '-infinity'::date),
    coalesce(new.milk_withhold_until, '-infinity'::date),
    coalesce(new.eggs_withhold_until, '-infinity'::date)
  );

  if v_last > '-infinity'::date and new.deleted_at is null then
    perform app_private.queue_reminder(
      new.vet_id, new.patient_id, 'withdrawal_ends',
      -- Sent on the morning the withholding lifts. Earlier would invite selling
      -- a day too soon, which is the whole thing this is guarding against.
      (v_last::timestamp at time zone 'UTC') + interval '7 hours',
      'withdrawal_ends',
      'withdrawal:' || new.id::text,
      null, null, new.id
    );
  else
    perform app_private.cancel_reminders_for(null, null, new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists treatments_sync_reminders on public.treatments;
create trigger treatments_sync_reminders
after insert or update on public.treatments
for each row execute function app_private.sync_withdrawal_reminder();

-- ---------------------------------------------------------------------------
-- Withdrawing consent withdraws the messages
-- ---------------------------------------------------------------------------

-- A client who turns reminders off should not receive one already sitting in
-- the queue from before. Consent is not only a gate at creation.
create or replace function app_private.sync_consent_reminders()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.communication_consent = true and new.communication_consent = false then
    update public.client_reminders r
    set status = 'cancelled', updated_at = now()
    where r.status = 'queued'
      and r.patient_id in (
        select po.patient_id from public.patient_owners po
        where po.client_id = new.id and po.valid_to is null and po.deleted_at is null
      );
  end if;

  return new;
end;
$$;

drop trigger if exists clients_sync_consent_reminders on public.clients;
create trigger clients_sync_consent_reminders
after update on public.clients
for each row execute function app_private.sync_consent_reminders();

-- ---------------------------------------------------------------------------
-- What the veterinarian can do with them today
-- ---------------------------------------------------------------------------

-- Until there is a provider, this is the product: a list of who to contact and
-- why. It carries no clinical detail beyond what is due (§12.2).
create or replace function public.due_reminders(p_within_days integer default 30)
returns table (
  id uuid,
  reminder_type text,
  template_key text,
  send_at timestamptz,
  status text,
  recipient_e164 text,
  patient_id uuid,
  patient_name text,
  client_name text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select r.id, r.reminder_type, r.template_key, r.send_at, r.status, r.recipient_e164,
         r.patient_id, p.name, c.name
  from public.client_reminders r
  join public.patients p on p.id = r.patient_id
  left join public.patient_owners po
    on po.patient_id = r.patient_id and po.is_primary and po.valid_to is null
  left join public.clients c on c.id = po.client_id
  where r.vet_id = app_private.require_active_vet()
    and r.status = 'queued'
    and r.send_at <= now() + make_interval(days => greatest(coalesce(p_within_days, 30), 0))
  order by r.send_at
$$;

revoke all on function public.due_reminders(integer) from public, anon;
grant execute on function public.due_reminders(integer) to authenticated;

-- Marking one done is how a vet clears a reminder they acted on by telephone.
create or replace function public.mark_reminder_handled(p_id uuid)
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

  update public.client_reminders
  set status = 'cancelled', updated_at = now()
  where id = p_id and vet_id = v_vet_id and status = 'queued';

  if not found then
    raise exception 'Reminder not found' using errcode = 'P0002';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'reminder.handled', 'client_reminder', p_id, null, '{}'::jsonb
  );
end;
$$;

revoke all on function public.mark_reminder_handled(uuid) from public, anon;
grant execute on function public.mark_reminder_handled(uuid) to authenticated;
