-- Phase 4: drop what was removed from scope (brief §11, §7.8).
--
-- Scheduling left the specification on 10 August and stock counting on the same
-- day, but neither left the database. The tables, their triggers and sixteen
-- RPCs stayed behind, still reachable by any authenticated caller. A dead table
-- is not harmless: it is a surface with row level security to keep correct, a
-- set of grants to review, and an invitation to a future reader to build against
-- something the product decided against.
--
-- Two things go, for the reasons already recorded:
--
--   Scheduling — appointments, daily_routes, daily_route_stops. Work does not
--   arrive through the application. A solo veterinarian is telephoned, agrees a
--   time on that call, and drives. A status field with no reader is an
--   obligation to maintain rather than information (§11).
--
--   Stock counting — inventory_batches, inventory_movements. Nobody counts what
--   is in the boot of their car, and a low-stock warning derived from an
--   unmaintained quantity is not useless but wrong (§7.8).
--
-- What stays is inventory_items, which is not stock. It is the drug list: what a
-- product contains, its usual route, its strength, and the withholding it
-- imposes. Those are properties of the product rather than counts of it, they do
-- not drift with use, and a treatment cannot be recorded correctly without them.

-- ---------------------------------------------------------------------------
-- The controlled entry points
-- ---------------------------------------------------------------------------

drop function if exists public.create_appointment(
  uuid, uuid, uuid, timestamptz, integer, text, text, text, text, numeric, numeric, uuid
);
drop function if exists public.update_appointment_details(
  uuid, timestamptz, integer, text, text, text, numeric, numeric, uuid, bigint
);
drop function if exists public.transition_appointment_status(uuid, text, text, uuid, bigint);
drop function if exists public.upsert_daily_route(uuid, date, text, uuid);
drop function if exists public.add_route_stop(uuid, uuid, uuid, integer, uuid);
drop function if exists public.remove_route_stop(uuid, uuid);
drop function if exists public.resequence_route_stops(uuid, uuid[], uuid);

drop function if exists public.restock_inventory_batch(
  uuid, uuid, text, date, numeric, bigint, uuid
);
drop function if exists public.record_inventory_consumption(uuid, uuid, uuid, numeric, text, uuid);
drop function if exists public.adjust_inventory(uuid, uuid, numeric, text, uuid);
drop function if exists public.write_off_expired_batch(uuid, uuid, text, uuid);
drop function if exists public.inventory_available_quantity(uuid);

-- The stock-era entry points to the item table itself. Both write
-- reorder_threshold, which is dropped below, and neither knows about the
-- formulary fields that are now the whole point of the table. upsert_product
-- supersedes them.
drop function if exists public.create_inventory_item(uuid, text, text, text, numeric, uuid);
drop function if exists public.update_inventory_item(uuid, text, text, text, numeric, boolean, uuid);

-- Anything left over from a signature that has drifted since it was written.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'create_appointment', 'update_appointment_details', 'transition_appointment_status',
        'upsert_daily_route', 'add_route_stop', 'remove_route_stop', 'resequence_route_stops',
        'restock_inventory_batch', 'record_inventory_consumption', 'adjust_inventory',
        'write_off_expired_batch', 'inventory_available_quantity',
        'create_inventory_item', 'update_inventory_item'
      )
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Guards belonging to those tables
-- ---------------------------------------------------------------------------

drop function if exists app_private.enforce_route_stop_tenant() cascade;
drop function if exists app_private.compact_route_stop_sequence() cascade;
drop function if exists app_private.shift_route_stop_sequence(uuid, integer) cascade;
drop function if exists app_private.prevent_inventory_movement_mutation() cascade;

-- A treatment could name a batch it did not own. With no batches there is
-- nothing to check, and the two tenant checks that still mean something stay.
create or replace function app_private.enforce_treatment_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1 from public.visits where id = new.visit_id and vet_id = new.vet_id
  ) then
    raise exception 'Record belongs to another account' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.patients where id = new.patient_id and vet_id = new.vet_id
  ) then
    raise exception 'Folder belongs to another account' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Columns that pointed at them
-- ---------------------------------------------------------------------------

alter table public.treatments drop column if exists inventory_batch_id;

-- The guard that freezes a signed record listed appointment_id among the
-- clinical columns it compares, so dropping the column would break every write
-- to a completed visit. Rewritten here with that one entry removed and every
-- other clause preserved exactly: this function is the reason a signed record
-- cannot be quietly edited, and it is not the place for incidental improvement.
create or replace function app_private.enforce_visit_record_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.id is distinct from new.id
     or old.vet_id is distinct from new.vet_id
     or old.created_at is distinct from new.created_at
     or old.created_by_device_id is distinct from new.created_by_device_id then
    raise exception 'Visit identity, ownership, and provenance cannot change' using errcode = '42501';
  end if;

  if old.workflow_status = 'voided' and new.workflow_status is distinct from 'voided' then
    raise exception 'A voided visit cannot be reopened' using errcode = '42501';
  end if;

  if old.workflow_status = 'completed' and new.workflow_status = 'draft' then
    raise exception 'A completed visit cannot be reopened' using errcode = '42501';
  end if;

  -- The void record is written exactly once, by the transition into 'voided'.
  -- Outside that transition it can never be written, rewritten, or cleared.
  if old.workflow_status <> 'draft'
     and new.workflow_status is not distinct from old.workflow_status
     and (old.voided_at is distinct from new.voided_at
          or old.void_reason is distinct from new.void_reason) then
    raise exception 'The void record of a visit cannot be changed' using errcode = '42501';
  end if;

  if old.workflow_status <> 'draft' then
    if old.deleted_at is distinct from new.deleted_at then
      raise exception 'A visit that has left draft cannot be deleted' using errcode = '42501';
    end if;

    if row(
         old.patient_id,
         old.visit_date,
         old.visit_type,
         old.chief_complaint,
         old.history_of_complaint,
         old.past_medical_history,
         old.current_medications,
         old.temperature_c,
         old.heart_rate_bpm,
         old.respiratory_rate_bpm,
         old.weight_value,
         old.weight_unit,
         old.body_condition_score,
         old.pain_score,
         old.problem_list,
         old.differential_diagnoses,
         old.tentative_diagnosis,
         old.definitive_diagnosis,
         old.treatment_plan,
         old.prescriptions,
         old.follow_up_plan,
         old.next_review_date,
         old.signed_at,
         old.completed_at
       ) is distinct from row(
         new.patient_id,
         new.visit_date,
         new.visit_type,
         new.chief_complaint,
         new.history_of_complaint,
         new.past_medical_history,
         new.current_medications,
         new.temperature_c,
         new.heart_rate_bpm,
         new.respiratory_rate_bpm,
         new.weight_value,
         new.weight_unit,
         new.body_condition_score,
         new.pain_score,
         new.problem_list,
         new.differential_diagnoses,
         new.tentative_diagnosis,
         new.definitive_diagnosis,
         new.treatment_plan,
         new.prescriptions,
         new.follow_up_plan,
         new.next_review_date,
         new.signed_at,
         new.completed_at
       ) then
      raise exception 'Clinical content of a visit that has left draft cannot be changed' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

alter table public.visits drop column if exists appointment_id;

-- create_visit still took an appointment to hang a record on. A consultation is
-- created by the act of attending; there is nothing to reference.
drop function if exists public.create_visit(
  uuid, uuid, timestamptz, text, uuid, text, uuid
);

create or replace function public.create_visit(
  p_id uuid,
  p_patient_id uuid,
  p_visit_date timestamptz,
  p_visit_type text,
  p_chief_complaint text default null,
  p_device_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_species text;
  v_kind text;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  if p_visit_type is null or p_visit_type not in (
    'home_call', 'clinic_visit', 'field_visit', 'emergency', 'follow_up', 'teleconsult'
  ) then
    raise exception 'Invalid visit type' using errcode = '22023';
  end if;

  select species, kind into v_species, v_kind
  from public.patients
  where id = p_patient_id and vet_id = v_vet_id and deleted_at is null;

  if v_species is null then
    raise exception 'Patient not found' using errcode = 'P0002';
  end if;

  insert into public.visits (
    id, vet_id, patient_id, visit_date, visit_type, chief_complaint,
    created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, p_patient_id, p_visit_date, p_visit_type,
    nullif(trim(p_chief_complaint), ''), p_device_id, p_device_id
  )
  on conflict (id) do nothing;

  if not found then
    if exists (select 1 from public.visits where id = p_id and vet_id = v_vet_id) then
      return p_id;
    end if;
    raise exception 'Visit ID is unavailable' using errcode = '42501';
  end if;

  -- Seeded from the species, so a bird is asked about its crop and a flock is
  -- asked nothing. Every system starts 'not_examined' so a normal finding can
  -- only ever be a deliberate act.
  insert into public.physical_exam_findings (
    vet_id, visit_id, system_name, status,
    created_by_device_id, last_modified_by_device_id
  )
  select v_vet_id, p_id, s.system_name, 'not_examined', p_device_id, p_device_id
  from unnest(app_private.exam_system_names(v_species, v_kind)) as s(system_name)
  on conflict (visit_id, system_name) do nothing;

  perform app_private.insert_audit_event(
    v_vet_id, 'visit.created', 'visit', p_id, null,
    jsonb_build_object('patient_id', p_patient_id, 'visit_type', p_visit_type)
  );

  return p_id;
end;
$$;

revoke all on function public.create_visit(uuid, uuid, timestamptz, text, text, uuid)
  from public, anon;
grant execute on function public.create_visit(uuid, uuid, timestamptz, text, text, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- The tables
-- ---------------------------------------------------------------------------

-- Order matters only for readability; each drop takes its own policies, indexes,
-- triggers and grants with it.
drop table if exists public.daily_route_stops cascade;
drop table if exists public.daily_routes cascade;
drop table if exists public.appointments cascade;

drop table if exists public.inventory_movements cascade;
drop table if exists public.inventory_batches cascade;

-- Stock left a threshold behind on the drug list. Nothing computes against it.
alter table public.inventory_items drop column if exists reorder_threshold;

comment on table public.inventory_items is
  'The drug list, not a stock count. What this veterinarian uses, what each '
  'product contains, its usual route and strength, and the withholding it '
  'imposes on a food animal. Quantities are deliberately not tracked (§7.8).';
