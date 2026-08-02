-- VetKeep Phase 2 house-call scheduling and field operations.
-- Appointments use request-then-confirm scheduling: there is no public open-booking
-- calendar, so every status change is a validated state-machine transition. Offline
-- devices replay mutations, therefore transitions carry an optional expected status and
-- stale transitions are rejected rather than silently applied.
--
-- Routes never store appointment IDs in an array. A route owns ordered `daily_route_stops`
-- rows so a stop can be added, removed, and manually reordered without rewriting the route.
-- No paid routing API is integrated; ordering is manual or client-computed nearest neighbour.

create table public.appointments (
  id uuid primary key,
  vet_id uuid not null references public.vets(id) on delete restrict,
  client_id uuid references public.clients(id) on delete restrict,
  patient_id uuid references public.patients(id) on delete restrict,
  appointment_type text not null
    check (appointment_type in ('home_call', 'clinic_visit', 'field_visit', 'emergency', 'follow_up')),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  status text not null default 'requested'
    check (status in ('requested', 'confirmed', 'declined', 'rescheduled', 'completed', 'cancelled', 'no_show')),
  status_changed_at timestamptz not null default now(),
  confirmed_at timestamptz,
  completed_at timestamptz,
  decline_reason text check (decline_reason is null or char_length(trim(decline_reason)) between 3 and 500),
  cancellation_reason text check (cancellation_reason is null or char_length(trim(cancellation_reason)) between 3 and 500),
  -- Emergency requests often arrive from someone who is not yet a registered client,
  -- so contact details are stored on the appointment itself.
  contact_name text check (contact_name is null or char_length(trim(contact_name)) between 1 and 160),
  contact_phone_display text check (contact_phone_display is null or char_length(trim(contact_phone_display)) between 7 and 30),
  contact_phone_e164 text check (contact_phone_e164 is null or contact_phone_e164 ~ '^[+][1-9][0-9]{7,14}$'),
  visit_address text check (visit_address is null or char_length(visit_address) <= 500),
  visit_latitude numeric(9,6) check (visit_latitude is null or visit_latitude between -90 and 90),
  visit_longitude numeric(9,6) check (visit_longitude is null or visit_longitude between -180 and 180),
  travel_notes text check (travel_notes is null or char_length(travel_notes) <= 1000),
  reason_for_visit text check (reason_for_visit is null or char_length(reason_for_visit) <= 1000),
  visit_id uuid references public.visits(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1 check (server_version > 0),
  created_by_device_id uuid references public.vet_devices(id) on delete set null,
  last_modified_by_device_id uuid references public.vet_devices(id) on delete set null,
  constraint appointments_schedule_window_check check (
    scheduled_start is null
    or scheduled_end is null
    or scheduled_end > scheduled_start
  ),
  -- A confirmed slot is a commitment, so it must carry a time.
  constraint appointments_confirmed_time_check check (
    status <> 'confirmed' or scheduled_start is not null
  ),
  -- Named distinctly from the inline column checks above: PostgreSQL auto-names an
  -- inline column check `<table>_<column>_check`, which would collide.
  constraint appointments_declined_requires_reason_check check (
    status <> 'declined' or decline_reason is not null
  ),
  constraint appointments_cancelled_requires_reason_check check (
    status <> 'cancelled' or cancellation_reason is not null
  ),
  -- An emergency may be created without a confirmed time, but never without a way
  -- to call the person back.
  constraint appointments_emergency_contact_check check (
    appointment_type <> 'emergency'
    or client_id is not null
    or (contact_name is not null and contact_phone_e164 is not null)
  )
);

create table public.daily_routes (
  id uuid primary key,
  vet_id uuid not null references public.vets(id) on delete restrict,
  route_date date not null,
  optimized boolean not null default false,
  optimization_method text
    check (optimization_method is null or optimization_method in ('manual', 'nearest_neighbor')),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1 check (server_version > 0),
  created_by_device_id uuid references public.vet_devices(id) on delete set null,
  last_modified_by_device_id uuid references public.vet_devices(id) on delete set null,
  constraint daily_routes_vet_date_key unique (vet_id, route_date)
);

-- Route stops are logistics rather than clinical records and both uniqueness rules below
-- are whole-table constraints, so `remove_route_stop` hard-deletes the row: a tombstone
-- would permanently reserve both the appointment slot and the sequence number. `deleted_at`
-- is kept only so the table matches the standard syncable row shape.
create table public.daily_route_stops (
  id uuid primary key,
  vet_id uuid not null references public.vets(id) on delete restrict,
  route_id uuid not null references public.daily_routes(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  sequence_number integer not null check (sequence_number > 0),
  estimated_arrival timestamptz,
  arrival_notes text check (arrival_notes is null or char_length(arrival_notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1 check (server_version > 0),
  created_by_device_id uuid references public.vet_devices(id) on delete set null,
  last_modified_by_device_id uuid references public.vet_devices(id) on delete set null,
  constraint daily_route_stops_route_appointment_key unique (route_id, appointment_id),
  constraint daily_route_stops_route_sequence_key unique (route_id, sequence_number)
);

create index appointments_vet_id_idx on public.appointments (vet_id) where deleted_at is null;
create index appointments_vet_schedule_idx on public.appointments (vet_id, scheduled_start) where deleted_at is null;
create index appointments_vet_status_idx on public.appointments (vet_id, status) where deleted_at is null;
create index appointments_client_idx on public.appointments (client_id) where client_id is not null;
create index appointments_patient_idx on public.appointments (patient_id) where patient_id is not null;
create index appointments_visit_idx on public.appointments (visit_id) where visit_id is not null;

create index daily_routes_vet_date_idx on public.daily_routes (vet_id, route_date desc);

create index daily_route_stops_vet_id_idx on public.daily_route_stops (vet_id);
create index daily_route_stops_route_idx on public.daily_route_stops (route_id, sequence_number);
create index daily_route_stops_appointment_idx on public.daily_route_stops (appointment_id);

create trigger appointments_set_row_version
before update on public.appointments
for each row execute function app_private.set_row_version();

create trigger daily_routes_set_row_version
before update on public.daily_routes
for each row execute function app_private.set_row_version();

create trigger daily_route_stops_set_row_version
before update on public.daily_route_stops
for each row execute function app_private.set_row_version();

-- ---------------------------------------------------------------------------
-- Parent-child ownership consistency (brief section 9.3)
-- ---------------------------------------------------------------------------

create or replace function app_private.enforce_appointment_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.client_id is not null and not exists (
    select 1 from public.clients where id = new.client_id and vet_id = new.vet_id
  ) then
    raise exception 'Appointment client belongs to a different account' using errcode = '42501';
  end if;

  if new.patient_id is not null and not exists (
    select 1 from public.patients where id = new.patient_id and vet_id = new.vet_id
  ) then
    raise exception 'Appointment patient belongs to a different account' using errcode = '42501';
  end if;

  if new.visit_id is not null and not exists (
    select 1 from public.visits where id = new.visit_id and vet_id = new.vet_id
  ) then
    raise exception 'Appointment visit belongs to a different account' using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function app_private.enforce_route_stop_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_route_vet_id uuid;
  v_appointment_vet_id uuid;
begin
  select vet_id into v_route_vet_id from public.daily_routes where id = new.route_id;

  if v_route_vet_id is null or v_route_vet_id <> new.vet_id then
    raise exception 'Route stop must belong to the same account as its route' using errcode = '42501';
  end if;

  select vet_id into v_appointment_vet_id from public.appointments where id = new.appointment_id;

  if v_appointment_vet_id is null or v_appointment_vet_id <> new.vet_id then
    raise exception 'Route stop appointment belongs to a different account' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger appointments_enforce_tenant
before insert or update on public.appointments
for each row execute function app_private.enforce_appointment_tenant();

create trigger daily_route_stops_enforce_tenant
before insert or update on public.daily_route_stops
for each row execute function app_private.enforce_route_stop_tenant();

-- ---------------------------------------------------------------------------
-- Appointment state machine
-- ---------------------------------------------------------------------------

-- The complete set of legal transitions. Anything absent here (including any
-- transition out of a terminal status) is rejected.
create or replace function app_private.appointment_transition_allowed(
  p_from text,
  p_to text
)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  -- requested   -> confirmed | declined
  -- confirmed   -> rescheduled | completed | cancelled | no_show
  -- rescheduled -> confirmed | cancelled
  --
  -- `rescheduled` is a transient state, not a terminal one: a moved appointment
  -- returns to `confirmed` once the new time is agreed, keeping one row per
  -- appointment so the patient timeline stays contiguous. A client who cannot
  -- agree a new time cancels instead. This extends the brief's §11.1 matrix,
  -- which listed no outgoing edge and left a rescheduled visit unconfirmable.
  --
  -- Every other pair, including a repeat of the current status and anything out of
  -- a terminal status, is false. coalesce guards against a null status producing a
  -- null that an `if not ...` caller would fall straight through.
  select coalesce(
    case p_from
      when 'requested' then p_to in ('confirmed', 'declined')
      when 'confirmed' then p_to in ('rescheduled', 'completed', 'cancelled', 'no_show')
      when 'rescheduled' then p_to in ('confirmed', 'cancelled')
      else false
    end,
    false
  );
$$;

comment on function app_private.appointment_transition_allowed(text, text) is
  'Authoritative appointment state machine for request-then-confirm scheduling.';

-- ---------------------------------------------------------------------------
-- Appointments
-- ---------------------------------------------------------------------------

create or replace function public.create_appointment(
  p_id uuid,
  p_appointment_type text,
  p_client_id uuid default null,
  p_patient_id uuid default null,
  p_scheduled_start timestamptz default null,
  p_scheduled_end timestamptz default null,
  p_reason_for_visit text default null,
  p_visit_address text default null,
  p_visit_latitude numeric default null,
  p_visit_longitude numeric default null,
  p_travel_notes text default null,
  p_contact_name text default null,
  p_contact_phone_display text default null,
  p_contact_phone_e164 text default null,
  p_device_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_contact_name text := nullif(trim(p_contact_name), '');
  v_contact_phone_e164 text := nullif(trim(p_contact_phone_e164), '');
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  if p_appointment_type is null
     or p_appointment_type not in ('home_call', 'clinic_visit', 'field_visit', 'emergency', 'follow_up') then
    raise exception 'Invalid appointment type' using errcode = '22023';
  end if;

  if v_contact_phone_e164 is not null and v_contact_phone_e164 !~ '^[+][1-9][0-9]{7,14}$' then
    raise exception 'Invalid E.164 phone number' using errcode = '22023';
  end if;

  -- Only an emergency may arrive without a proposed time.
  if p_appointment_type <> 'emergency' and p_scheduled_start is null then
    raise exception 'A proposed start time is required' using errcode = '22023';
  end if;

  if p_scheduled_start is not null
     and p_scheduled_end is not null
     and p_scheduled_end <= p_scheduled_start then
    raise exception 'Scheduled end must be after scheduled start' using errcode = '22023';
  end if;

  if p_appointment_type = 'emergency'
     and p_client_id is null
     and (v_contact_name is null or v_contact_phone_e164 is null) then
    raise exception 'Emergency appointments require contact information' using errcode = '22023';
  end if;

  if p_client_id is not null and not exists (
    select 1 from public.clients
    where id = p_client_id and vet_id = v_vet_id and deleted_at is null
  ) then
    raise exception 'Client not found' using errcode = 'P0002';
  end if;

  if p_patient_id is not null and not exists (
    select 1 from public.patients
    where id = p_patient_id and vet_id = v_vet_id and deleted_at is null
  ) then
    raise exception 'Patient not found' using errcode = 'P0002';
  end if;

  -- Appointments always enter through 'requested'. The vet confirms separately.
  insert into public.appointments (
    id, vet_id, client_id, patient_id, appointment_type,
    scheduled_start, scheduled_end, status, status_changed_at,
    contact_name, contact_phone_display, contact_phone_e164,
    visit_address, visit_latitude, visit_longitude,
    travel_notes, reason_for_visit,
    created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, p_client_id, p_patient_id, p_appointment_type,
    p_scheduled_start, p_scheduled_end, 'requested', now(),
    v_contact_name, nullif(trim(p_contact_phone_display), ''), v_contact_phone_e164,
    nullif(trim(p_visit_address), ''), p_visit_latitude, p_visit_longitude,
    nullif(trim(p_travel_notes), ''), nullif(trim(p_reason_for_visit), ''),
    p_device_id, p_device_id
  )
  on conflict (id) do nothing;

  if not found then
    if exists (select 1 from public.appointments where id = p_id and vet_id = v_vet_id) then
      return p_id;
    end if;
    raise exception 'Appointment ID is unavailable' using errcode = '42501';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'appointment.created', 'appointment', p_id, null,
    jsonb_build_object('appointment_type', p_appointment_type, 'status', 'requested')
  );

  return p_id;
end;
$$;

create or replace function public.update_appointment_details(
  p_id uuid,
  p_appointment_type text,
  p_scheduled_start timestamptz default null,
  p_scheduled_end timestamptz default null,
  p_client_id uuid default null,
  p_patient_id uuid default null,
  p_reason_for_visit text default null,
  p_visit_address text default null,
  p_visit_latitude numeric default null,
  p_visit_longitude numeric default null,
  p_travel_notes text default null,
  p_contact_name text default null,
  p_contact_phone_display text default null,
  p_contact_phone_e164 text default null,
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
  v_contact_name text := nullif(trim(p_contact_name), '');
  v_contact_phone_e164 text := nullif(trim(p_contact_phone_e164), '');
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  if p_appointment_type is null
     or p_appointment_type not in ('home_call', 'clinic_visit', 'field_visit', 'emergency', 'follow_up') then
    raise exception 'Invalid appointment type' using errcode = '22023';
  end if;

  if v_contact_phone_e164 is not null and v_contact_phone_e164 !~ '^[+][1-9][0-9]{7,14}$' then
    raise exception 'Invalid E.164 phone number' using errcode = '22023';
  end if;

  if p_scheduled_start is not null
     and p_scheduled_end is not null
     and p_scheduled_end <= p_scheduled_start then
    raise exception 'Scheduled end must be after scheduled start' using errcode = '22023';
  end if;

  select status into v_status
  from public.appointments
  where id = p_id and vet_id = v_vet_id and deleted_at is null
  for update;

  if v_status is null then
    raise exception 'Appointment not found' using errcode = 'P0002';
  end if;

  -- Details are only editable while the appointment is still open. Status changes
  -- go through transition_appointment_status.
  if v_status not in ('requested', 'confirmed') then
    raise exception 'Closed appointments cannot be edited' using errcode = '22023';
  end if;

  if v_status = 'confirmed' and p_scheduled_start is null then
    raise exception 'A confirmed appointment requires a scheduled start time' using errcode = '22023';
  end if;

  if p_appointment_type <> 'emergency' and p_scheduled_start is null then
    raise exception 'A proposed start time is required' using errcode = '22023';
  end if;

  if p_appointment_type = 'emergency'
     and p_client_id is null
     and (v_contact_name is null or v_contact_phone_e164 is null) then
    raise exception 'Emergency appointments require contact information' using errcode = '22023';
  end if;

  if p_client_id is not null and not exists (
    select 1 from public.clients
    where id = p_client_id and vet_id = v_vet_id and deleted_at is null
  ) then
    raise exception 'Client not found' using errcode = 'P0002';
  end if;

  if p_patient_id is not null and not exists (
    select 1 from public.patients
    where id = p_patient_id and vet_id = v_vet_id and deleted_at is null
  ) then
    raise exception 'Patient not found' using errcode = 'P0002';
  end if;

  update public.appointments
  set appointment_type = p_appointment_type,
      scheduled_start = p_scheduled_start,
      scheduled_end = p_scheduled_end,
      client_id = p_client_id,
      patient_id = p_patient_id,
      reason_for_visit = nullif(trim(p_reason_for_visit), ''),
      visit_address = nullif(trim(p_visit_address), ''),
      visit_latitude = p_visit_latitude,
      visit_longitude = p_visit_longitude,
      travel_notes = nullif(trim(p_travel_notes), ''),
      contact_name = v_contact_name,
      contact_phone_display = nullif(trim(p_contact_phone_display), ''),
      contact_phone_e164 = v_contact_phone_e164,
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_id and vet_id = v_vet_id and deleted_at is null;

  if not found then
    raise exception 'Appointment not found' using errcode = 'P0002';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'appointment.updated', 'appointment', p_id, null,
    jsonb_build_object('appointment_type', p_appointment_type)
  );
end;
$$;

-- Offline devices replay queued mutations, so a transition may arrive after the server
-- has already moved on. `p_expected_status` lets the caller pin the status it observed;
-- a mismatch is reported as a stale transition instead of being applied.
create or replace function public.transition_appointment_status(
  p_id uuid,
  p_to_status text,
  p_expected_status text default null,
  p_reason text default null,
  p_scheduled_start timestamptz default null,
  p_scheduled_end timestamptz default null,
  p_visit_id uuid default null,
  p_device_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_appointment public.appointments%rowtype;
  v_reason text := nullif(trim(p_reason), '');
  v_new_start timestamptz;
  v_new_end timestamptz;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  if p_to_status is null
     or p_to_status not in ('requested', 'confirmed', 'declined', 'rescheduled', 'completed', 'cancelled', 'no_show') then
    raise exception 'Invalid appointment status' using errcode = '22023';
  end if;

  select * into v_appointment
  from public.appointments
  where id = p_id and vet_id = v_vet_id and deleted_at is null
  for update;

  if v_appointment.id is null then
    raise exception 'Appointment not found' using errcode = 'P0002';
  end if;

  if p_expected_status is not null and p_expected_status <> v_appointment.status then
    raise exception 'Appointment status has changed on the server' using errcode = '22023',
      detail = format('expected %s but the appointment is %s', p_expected_status, v_appointment.status);
  end if;

  if not app_private.appointment_transition_allowed(v_appointment.status, p_to_status) then
    raise exception 'Appointment status transition is not allowed' using errcode = '22023',
      detail = format('%s -> %s is not a legal transition', v_appointment.status, p_to_status);
  end if;

  if p_to_status = 'declined' and v_reason is null then
    raise exception 'A decline reason is required' using errcode = '22023';
  end if;

  if p_to_status = 'cancelled' and v_reason is null then
    raise exception 'A cancellation reason is required' using errcode = '22023';
  end if;

  if p_scheduled_start is not null then
    v_new_start := p_scheduled_start;
    v_new_end := p_scheduled_end;
  else
    v_new_start := v_appointment.scheduled_start;
    v_new_end := v_appointment.scheduled_end;
  end if;

  if v_new_start is not null and v_new_end is not null and v_new_end <= v_new_start then
    raise exception 'Scheduled end must be after scheduled start' using errcode = '22023';
  end if;

  if p_to_status = 'confirmed' and v_new_start is null then
    raise exception 'Confirming an appointment requires a scheduled start time' using errcode = '22023';
  end if;

  if p_to_status = 'rescheduled' and p_scheduled_start is null then
    raise exception 'Rescheduling requires a new scheduled start time' using errcode = '22023';
  end if;

  if p_visit_id is not null and not exists (
    select 1 from public.visits where id = p_visit_id and vet_id = v_vet_id
  ) then
    raise exception 'Visit not found' using errcode = 'P0002';
  end if;

  update public.appointments
  set status = p_to_status,
      status_changed_at = now(),
      scheduled_start = v_new_start,
      scheduled_end = v_new_end,
      confirmed_at = case when p_to_status = 'confirmed' then now() else confirmed_at end,
      completed_at = case when p_to_status = 'completed' then now() else completed_at end,
      decline_reason = case when p_to_status = 'declined' then v_reason else decline_reason end,
      cancellation_reason = case when p_to_status = 'cancelled' then v_reason else cancellation_reason end,
      visit_id = coalesce(p_visit_id, visit_id),
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_id and vet_id = v_vet_id and deleted_at is null;

  if not found then
    raise exception 'Appointment not found' using errcode = 'P0002';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'appointment.status_changed', 'appointment', p_id, v_reason,
    jsonb_build_object('from_status', v_appointment.status, 'to_status', p_to_status)
  );

  return p_to_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Daily routes
-- ---------------------------------------------------------------------------

-- Renumbering stops in place would transiently duplicate a sequence number
-- (moving 4 -> 3 while another row still holds 3), and PostgreSQL checks a
-- non-deferrable unique index row by row. Both renumbering paths therefore first
-- shift every stop on the route above the current maximum, which cannot collide
-- because the shifted values start at max + 1, and only then write the final
-- 1..n order, which cannot collide because n <= max < max + 1.
create or replace function app_private.shift_route_stop_sequence(p_route_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_offset integer;
begin
  select coalesce(max(sequence_number), 0) into v_offset
  from public.daily_route_stops
  where route_id = p_route_id;

  if v_offset = 0 then
    return 0;
  end if;

  update public.daily_route_stops
  set sequence_number = sequence_number + v_offset
  where route_id = p_route_id;

  return v_offset;
end;
$$;

-- Closes gaps left by a removed stop so the remaining stops stay 1..n.
create or replace function app_private.compact_route_stop_sequence(p_route_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if app_private.shift_route_stop_sequence(p_route_id) = 0 then
    return;
  end if;

  update public.daily_route_stops s
  set sequence_number = ordered.new_sequence_number
  from (
    select id, (row_number() over (order by sequence_number))::integer as new_sequence_number
    from public.daily_route_stops
    where route_id = p_route_id
  ) as ordered
  where s.id = ordered.id;
end;
$$;

-- A vet has exactly one route per day. Two offline devices can generate different
-- IDs for the same day, so the route that already holds the date wins and its ID is
-- returned; the caller remaps its local rows to the returned ID.
create or replace function public.upsert_daily_route(
  p_id uuid,
  p_route_date date,
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
  v_route_id uuid;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  if p_route_date is null then
    raise exception 'A route date is required' using errcode = '22023';
  end if;

  select id into v_route_id
  from public.daily_routes
  where vet_id = v_vet_id and route_date = p_route_date
  for update;

  if v_route_id is not null then
    update public.daily_routes
    set notes = coalesce(nullif(trim(p_notes), ''), notes),
        deleted_at = null,
        last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
    where id = v_route_id;

    perform app_private.insert_audit_event(
      v_vet_id, 'daily_route.updated', 'daily_route', v_route_id, null,
      jsonb_build_object('route_date', p_route_date, 'requested_id', p_id)
    );

    return v_route_id;
  end if;

  insert into public.daily_routes (
    id, vet_id, route_date, notes, created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, p_route_date, nullif(trim(p_notes), ''), p_device_id, p_device_id
  )
  on conflict (id) do update
    set route_date = excluded.route_date,
        notes = coalesce(excluded.notes, public.daily_routes.notes),
        deleted_at = null,
        last_modified_by_device_id = coalesce(excluded.last_modified_by_device_id, public.daily_routes.last_modified_by_device_id)
    where public.daily_routes.vet_id = v_vet_id
  returning id into v_route_id;

  if v_route_id is null then
    raise exception 'Route ID is unavailable' using errcode = '42501';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'daily_route.created', 'daily_route', v_route_id, null,
    jsonb_build_object('route_date', p_route_date)
  );

  return v_route_id;
end;
$$;

create or replace function public.add_route_stop(
  p_id uuid,
  p_route_id uuid,
  p_appointment_id uuid,
  p_sequence_number integer default null,
  p_estimated_arrival timestamptz default null,
  p_device_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_appointment_status text;
  v_existing_stop_id uuid;
  v_sequence_number integer;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  -- Both parents must belong to the calling vet before anything is written.
  if not exists (
    select 1 from public.daily_routes
    where id = p_route_id and vet_id = v_vet_id and deleted_at is null
  ) then
    raise exception 'Route not found' using errcode = 'P0002';
  end if;

  select status into v_appointment_status
  from public.appointments
  where id = p_appointment_id and vet_id = v_vet_id and deleted_at is null;

  if v_appointment_status is null then
    raise exception 'Appointment not found' using errcode = 'P0002';
  end if;

  if v_appointment_status not in ('requested', 'confirmed') then
    raise exception 'Only open appointments can be added to a route' using errcode = '22023';
  end if;

  -- Replaying the same add offline must not create a second stop for the appointment.
  select id into v_existing_stop_id
  from public.daily_route_stops
  where route_id = p_route_id and appointment_id = p_appointment_id;

  if v_existing_stop_id is not null then
    return v_existing_stop_id;
  end if;

  if p_sequence_number is null then
    select coalesce(max(sequence_number), 0) + 1 into v_sequence_number
    from public.daily_route_stops
    where route_id = p_route_id;
  else
    if p_sequence_number < 1 then
      raise exception 'Sequence number must be greater than zero' using errcode = '22023';
    end if;

    if exists (
      select 1 from public.daily_route_stops
      where route_id = p_route_id and sequence_number = p_sequence_number
    ) then
      raise exception 'Route stop sequence number is already in use' using errcode = '23505';
    end if;

    v_sequence_number := p_sequence_number;
  end if;

  insert into public.daily_route_stops (
    id, vet_id, route_id, appointment_id, sequence_number, estimated_arrival,
    created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, p_route_id, p_appointment_id, v_sequence_number, p_estimated_arrival,
    p_device_id, p_device_id
  )
  on conflict (id) do nothing;

  if not found then
    if exists (select 1 from public.daily_route_stops where id = p_id and vet_id = v_vet_id) then
      return p_id;
    end if;
    raise exception 'Route stop ID is unavailable' using errcode = '42501';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'route_stop.added', 'route_stop', p_id, null,
    jsonb_build_object(
      'route_id', p_route_id,
      'appointment_id', p_appointment_id,
      'sequence_number', v_sequence_number
    )
  );

  return p_id;
end;
$$;

create or replace function public.remove_route_stop(
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
  v_route_id uuid;
  v_appointment_id uuid;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  select route_id, appointment_id into v_route_id, v_appointment_id
  from public.daily_route_stops
  where id = p_id and vet_id = v_vet_id
  for update;

  if v_route_id is null then
    raise exception 'Route stop not found' using errcode = 'P0002';
  end if;

  delete from public.daily_route_stops where id = p_id and vet_id = v_vet_id;

  perform app_private.compact_route_stop_sequence(v_route_id);

  perform app_private.insert_audit_event(
    v_vet_id, 'route_stop.removed', 'route_stop', p_id, nullif(trim(p_reason), ''),
    jsonb_build_object('route_id', v_route_id, 'appointment_id', v_appointment_id)
  );
end;
$$;

-- Manual reordering. `p_stop_ids` is the complete new order for the route: position 1
-- in the array becomes sequence_number 1. Stops are shifted above the current maximum
-- first, so swapping two adjacent stops never transits a duplicate sequence number.
create or replace function public.resequence_route_stops(
  p_route_id uuid,
  p_stop_ids uuid[],
  p_optimization_method text default 'manual',
  p_device_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_supplied integer;
  v_distinct integer;
  v_owned integer;
  v_total integer;
  v_method text := coalesce(nullif(trim(p_optimization_method), ''), 'manual');
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  if v_method not in ('manual', 'nearest_neighbor') then
    raise exception 'Invalid optimization method' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.daily_routes
    where id = p_route_id and vet_id = v_vet_id and deleted_at is null
  ) then
    raise exception 'Route not found' using errcode = 'P0002';
  end if;

  if p_stop_ids is null or cardinality(p_stop_ids) = 0 then
    raise exception 'The new order must contain every stop on the route' using errcode = '22023';
  end if;

  if array_position(p_stop_ids, null) is not null then
    raise exception 'The new order must not contain a null stop' using errcode = '22023';
  end if;

  v_supplied := cardinality(p_stop_ids);
  select count(distinct t.stop_id)::integer into v_distinct
  from unnest(p_stop_ids) as t(stop_id);

  if v_distinct <> v_supplied then
    raise exception 'The new order must not repeat a stop' using errcode = '22023';
  end if;

  select count(*)::integer into v_owned
  from public.daily_route_stops
  where route_id = p_route_id and vet_id = v_vet_id and id = any (p_stop_ids);

  select count(*)::integer into v_total
  from public.daily_route_stops
  where route_id = p_route_id;

  if v_owned <> v_supplied or v_total <> v_supplied then
    raise exception 'The new order must contain every stop on the route' using errcode = '22023';
  end if;

  perform app_private.shift_route_stop_sequence(p_route_id);

  update public.daily_route_stops s
  set sequence_number = ordered.new_sequence_number::integer,
      last_modified_by_device_id = coalesce(p_device_id, s.last_modified_by_device_id)
  from unnest(p_stop_ids) with ordinality as ordered(stop_id, new_sequence_number)
  where s.id = ordered.stop_id
    and s.route_id = p_route_id
    and s.vet_id = v_vet_id;

  update public.daily_routes
  set optimized = (v_method <> 'manual'),
      optimization_method = v_method,
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_route_id and vet_id = v_vet_id;

  perform app_private.insert_audit_event(
    v_vet_id, 'route_stops.resequenced', 'daily_route', p_route_id, null,
    jsonb_build_object('stop_count', v_supplied, 'optimization_method', v_method)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.appointments enable row level security;
alter table public.daily_routes enable row level security;
alter table public.daily_route_stops enable row level security;

create policy appointments_select_own
on public.appointments
for select
to authenticated
using (vet_id = app_private.current_vet_id() and auth.jwt() ->> 'aal' = 'aal2');

create policy daily_routes_select_own
on public.daily_routes
for select
to authenticated
using (vet_id = app_private.current_vet_id() and auth.jwt() ->> 'aal' = 'aal2');

create policy daily_route_stops_select_own
on public.daily_route_stops
for select
to authenticated
using (vet_id = app_private.current_vet_id() and auth.jwt() ->> 'aal' = 'aal2');

revoke all on public.appointments from anon, authenticated;
revoke all on public.daily_routes from anon, authenticated;
revoke all on public.daily_route_stops from anon, authenticated;

grant select on public.appointments to authenticated;
grant select on public.daily_routes to authenticated;
grant select on public.daily_route_stops to authenticated;

grant execute on function public.create_appointment(uuid, text, uuid, uuid, timestamptz, timestamptz, text, text, numeric, numeric, text, text, text, text, uuid) to authenticated;
grant execute on function public.update_appointment_details(uuid, text, timestamptz, timestamptz, uuid, uuid, text, text, numeric, numeric, text, text, text, text, uuid) to authenticated;
grant execute on function public.transition_appointment_status(uuid, text, text, text, timestamptz, timestamptz, uuid, uuid) to authenticated;
grant execute on function public.upsert_daily_route(uuid, date, text, uuid) to authenticated;
grant execute on function public.add_route_stop(uuid, uuid, uuid, integer, timestamptz, uuid) to authenticated;
grant execute on function public.remove_route_stop(uuid, text, uuid) to authenticated;
grant execute on function public.resequence_route_stops(uuid, uuid[], text, uuid) to authenticated;

revoke execute on function public.create_appointment(uuid, text, uuid, uuid, timestamptz, timestamptz, text, text, numeric, numeric, text, text, text, text, uuid) from public, anon;
revoke execute on function public.update_appointment_details(uuid, text, timestamptz, timestamptz, uuid, uuid, text, text, numeric, numeric, text, text, text, text, uuid) from public, anon;
revoke execute on function public.transition_appointment_status(uuid, text, text, text, timestamptz, timestamptz, uuid, uuid) from public, anon;
revoke execute on function public.upsert_daily_route(uuid, date, text, uuid) from public, anon;
revoke execute on function public.add_route_stop(uuid, uuid, uuid, integer, timestamptz, uuid) from public, anon;
revoke execute on function public.remove_route_stop(uuid, text, uuid) from public, anon;
revoke execute on function public.resequence_route_stops(uuid, uuid[], text, uuid) from public, anon;

revoke all on function app_private.appointment_transition_allowed(text, text) from public, anon, authenticated;
revoke all on function app_private.enforce_appointment_tenant() from public, anon, authenticated;
revoke all on function app_private.enforce_route_stop_tenant() from public, anon, authenticated;
revoke all on function app_private.shift_route_stop_sequence(uuid) from public, anon, authenticated;
revoke all on function app_private.compact_route_stop_sequence(uuid) from public, anon, authenticated;
