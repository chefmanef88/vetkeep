-- Surgery, and the anaesthetic that goes with it.
--
-- The record could say a procedure was performed only by someone typing it into
-- the treatment plan. That loses the part that matters most afterwards: what
-- the animal was given, at what dose, who held it, whether it woke up, and what
-- the owner was told to do that evening.
--
-- Two things shape this table.
--
-- Most surgery a house-call and farm vet does is routine rather than
-- therapeutic — neutering, disbudding, dehorning, castration — and those are
-- planned, priced and consented differently from a caesarean at midnight. The
-- kind is recorded rather than inferred from the procedure name, because the
-- same operation can be either: a spay is routine on a healthy bitch and
-- therapeutic on a pyometra.
--
-- And a dehorning session is one afternoon's work across forty calves, not
-- forty operations. animals_treated carries the count, exactly as it does on a
-- treatment, so the record matches how the work is done and how it is billed.

create table if not exists public.surgical_procedures (
  id uuid primary key,
  vet_id uuid not null references public.vets(id) on delete restrict,
  visit_id uuid not null references public.visits(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,

  procedure_name text not null
    check (char_length(trim(procedure_name)) between 2 and 160),
  -- Recorded, not inferred. A spay is routine on a healthy bitch and
  -- therapeutic on a pyometra, and the consent conversation differs.
  procedure_kind text not null
    check (procedure_kind in ('routine', 'therapeutic', 'emergency')),
  -- Groups only. Null on an individual, where the count is always one.
  animals_treated integer check (animals_treated is null or animals_treated > 0),
  performed_at timestamptz not null default now(),
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),

  -- The anaesthetic. 'none' is a real answer — a disbudding under local, a
  -- standing castration — and is recorded rather than left blank, so a missing
  -- protocol reads as "not written down" instead of "none given".
  anaesthesia text not null
    check (anaesthesia in ('none', 'local', 'regional', 'sedation', 'general')),
  premedication text check (premedication is null or char_length(premedication) <= 500),
  induction_agent text check (induction_agent is null or char_length(induction_agent) <= 300),
  maintenance_agent text check (maintenance_agent is null or char_length(maintenance_agent) <= 300),
  analgesia text check (analgesia is null or char_length(analgesia) <= 500),
  monitoring text check (monitoring is null or char_length(monitoring) <= 1000),

  pre_op_assessment text check (pre_op_assessment is null or char_length(pre_op_assessment) <= 2000),
  post_op_instructions text check (post_op_instructions is null or char_length(post_op_instructions) <= 2000),
  complications text check (complications is null or char_length(complications) <= 2000),
  -- Defaults to uneventful because that is the common case, but 'died' exists
  -- so an anaesthetic death is recordable here rather than only in prose.
  outcome text not null default 'uneventful'
    check (outcome in ('uneventful', 'complication', 'died')),
  assistant text check (assistant is null or char_length(assistant) <= 160),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1 check (server_version > 0),
  created_by_device_id uuid references public.vet_devices(id) on delete set null,
  last_modified_by_device_id uuid references public.vet_devices(id) on delete set null,

  -- A general anaesthetic without an induction agent is an incomplete record,
  -- not a valid one. Only asked where the protocol implies it: a local block
  -- has nothing to induce.
  check (
    anaesthesia not in ('general')
    or induction_agent is not null
  )
);

create index if not exists surgical_procedures_visit_idx
  on public.surgical_procedures (visit_id) where deleted_at is null;
create index if not exists surgical_procedures_patient_idx
  on public.surgical_procedures (patient_id, performed_at desc) where deleted_at is null;

alter table public.surgical_procedures enable row level security;

drop policy if exists surgical_procedures_select_own on public.surgical_procedures;
create policy surgical_procedures_select_own on public.surgical_procedures
  for select using (
    vet_id = app_private.current_vet_id()
    and (auth.jwt() ->> 'aal') = 'aal2'
  );

-- Revoked before granting, which is not defensive noise. The database carries a
-- default ACL handing authenticated TRUNCATE, REFERENCES and TRIGGER on new
-- tables, and RLS does not apply to TRUNCATE — so a table created without this
-- line is one a signed-in client can empty. Every other table in this schema
-- does the same; this one did not, and arrived with Dxtm until it was checked.
revoke all on public.surgical_procedures from anon, authenticated;

-- Read only. Every write goes through a controlled function, as everywhere else.
grant select on public.surgical_procedures to authenticated;

create or replace function app_private.enforce_surgical_procedure_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_visit_vet uuid;
  v_visit_patient uuid;
begin
  select vet_id, patient_id into v_visit_vet, v_visit_patient
  from public.visits where id = new.visit_id;

  if v_visit_vet is null or v_visit_vet <> new.vet_id then
    raise exception 'Consultation belongs to another practice' using errcode = '42501';
  end if;

  -- The procedure hangs off the consultation, so the animal must be the
  -- consultation's animal. Without this a record could be attached to the
  -- wrong folder while still passing every tenant check.
  if v_visit_patient <> new.patient_id then
    raise exception 'Procedure does not belong to this animal' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists surgical_procedures_tenant_guard on public.surgical_procedures;
create trigger surgical_procedures_tenant_guard
  before insert or update on public.surgical_procedures
  for each row execute function app_private.enforce_surgical_procedure_tenant();

drop trigger if exists surgical_procedures_set_row_version on public.surgical_procedures;
create trigger surgical_procedures_set_row_version
  before update on public.surgical_procedures
  for each row execute function app_private.set_row_version();

comment on table public.surgical_procedures is
  'A surgical procedure performed during a consultation, with its anaesthetic '
  'protocol, pre-operative assessment and post-operative instructions. One row '
  'per procedure — a group session is one row carrying animals_treated.';

-- ---------------------------------------------------------------------------
-- Recording one
-- ---------------------------------------------------------------------------

create or replace function public.record_surgical_procedure(
  p_id uuid,
  p_visit_id uuid,
  p_procedure_name text,
  p_procedure_kind text,
  p_anaesthesia text,
  p_animals_treated integer default null,
  p_performed_at timestamptz default null,
  p_duration_minutes integer default null,
  p_premedication text default null,
  p_induction_agent text default null,
  p_maintenance_agent text default null,
  p_analgesia text default null,
  p_monitoring text default null,
  p_pre_op_assessment text default null,
  p_post_op_instructions text default null,
  p_complications text default null,
  p_outcome text default 'uneventful',
  p_assistant text default null,
  p_device_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_patient_id uuid;
  v_status text;
  v_kind text;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  select v.patient_id, v.workflow_status, p.kind
    into v_patient_id, v_status, v_kind
  from public.visits v
  join public.patients p on p.id = v.patient_id
  where v.id = p_visit_id and v.vet_id = v_vet_id and v.deleted_at is null;

  if v_patient_id is null then
    raise exception 'Consultation not found' using errcode = 'P0002';
  end if;

  -- A signed record is closed. A procedure remembered afterwards is an
  -- amendment, which is a different act with its own trail.
  if v_status <> 'draft' then
    raise exception 'This record is signed and cannot take new entries' using errcode = '42501';
  end if;

  if p_procedure_kind not in ('routine', 'therapeutic', 'emergency') then
    raise exception 'Invalid procedure kind' using errcode = '22023';
  end if;

  if p_anaesthesia not in ('none', 'local', 'regional', 'sedation', 'general') then
    raise exception 'Invalid anaesthesia type' using errcode = '22023';
  end if;

  if coalesce(p_outcome, 'uneventful') not in ('uneventful', 'complication', 'died') then
    raise exception 'Invalid outcome' using errcode = '22023';
  end if;

  if p_anaesthesia = 'general' and nullif(trim(coalesce(p_induction_agent, '')), '') is null then
    raise exception 'A general anaesthetic needs its induction agent recorded' using errcode = '22023';
  end if;

  -- A count belongs to a group, in the same way the population figures do.
  if v_kind <> 'group' and p_animals_treated is not null then
    raise exception 'A count belongs to a group folder' using errcode = '22023';
  end if;

  if p_animals_treated is not null and p_animals_treated <= 0 then
    raise exception 'Number treated must be more than zero' using errcode = '22023';
  end if;

  insert into public.surgical_procedures (
    id, vet_id, visit_id, patient_id, procedure_name, procedure_kind,
    animals_treated, performed_at, duration_minutes, anaesthesia, premedication,
    induction_agent, maintenance_agent, analgesia, monitoring,
    pre_op_assessment, post_op_instructions, complications, outcome, assistant,
    created_by_device_id, last_modified_by_device_id
  ) values (
    p_id, v_vet_id, p_visit_id, v_patient_id,
    trim(p_procedure_name), p_procedure_kind,
    p_animals_treated, coalesce(p_performed_at, now()), p_duration_minutes,
    p_anaesthesia,
    nullif(trim(p_premedication), ''), nullif(trim(p_induction_agent), ''),
    nullif(trim(p_maintenance_agent), ''), nullif(trim(p_analgesia), ''),
    nullif(trim(p_monitoring), ''), nullif(trim(p_pre_op_assessment), ''),
    nullif(trim(p_post_op_instructions), ''), nullif(trim(p_complications), ''),
    coalesce(p_outcome, 'uneventful'), nullif(trim(p_assistant), ''),
    p_device_id, p_device_id
  )
  on conflict (id) do nothing;

  if not found then
    -- A replayed sync is not an error; the row already exists as it was sent.
    if exists (select 1 from public.surgical_procedures where id = p_id and vet_id = v_vet_id) then
      return p_id;
    end if;
    raise exception 'Procedure ID is unavailable' using errcode = '42501';
  end if;

  perform app_private.insert_audit_event(
    v_vet_id, 'surgical_procedure.recorded', 'surgical_procedure', p_id, null,
    jsonb_build_object(
      'visit_id', p_visit_id,
      'procedure', trim(p_procedure_name),
      'kind', p_procedure_kind,
      'anaesthesia', p_anaesthesia,
      'outcome', coalesce(p_outcome, 'uneventful')
    )
  );

  return p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Correcting one, until its consultation is signed
-- ---------------------------------------------------------------------------

create or replace function public.update_surgical_procedure(
  p_id uuid,
  p_procedure_name text,
  p_procedure_kind text,
  p_anaesthesia text,
  p_animals_treated integer default null,
  p_duration_minutes integer default null,
  p_premedication text default null,
  p_induction_agent text default null,
  p_maintenance_agent text default null,
  p_analgesia text default null,
  p_monitoring text default null,
  p_pre_op_assessment text default null,
  p_post_op_instructions text default null,
  p_complications text default null,
  p_outcome text default 'uneventful',
  p_assistant text default null,
  p_device_id uuid default null,
  p_base_server_version bigint default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_vet_id uuid;
  v_current bigint;
  v_status text;
  v_kind text;
begin
  perform app_private.require_aal2();
  v_vet_id := app_private.require_active_vet();

  select s.server_version, v.workflow_status, p.kind
    into v_current, v_status, v_kind
  from public.surgical_procedures s
  join public.visits v on v.id = s.visit_id
  join public.patients p on p.id = s.patient_id
  where s.id = p_id and s.vet_id = v_vet_id and s.deleted_at is null;

  if v_current is null then
    raise exception 'Procedure not found' using errcode = 'P0002';
  end if;

  if v_status <> 'draft' then
    raise exception 'This record is signed and cannot be edited' using errcode = '42501';
  end if;

  if p_procedure_kind not in ('routine', 'therapeutic', 'emergency') then
    raise exception 'Invalid procedure kind' using errcode = '22023';
  end if;

  if p_anaesthesia not in ('none', 'local', 'regional', 'sedation', 'general') then
    raise exception 'Invalid anaesthesia type' using errcode = '22023';
  end if;

  if coalesce(p_outcome, 'uneventful') not in ('uneventful', 'complication', 'died') then
    raise exception 'Invalid outcome' using errcode = '22023';
  end if;

  if p_anaesthesia = 'general' and nullif(trim(coalesce(p_induction_agent, '')), '') is null then
    raise exception 'A general anaesthetic needs its induction agent recorded' using errcode = '22023';
  end if;

  if v_kind <> 'group' and p_animals_treated is not null then
    raise exception 'A count belongs to a group folder' using errcode = '22023';
  end if;

  perform app_private.assert_fresh(p_base_server_version, v_current, 'procedure');

  update public.surgical_procedures
  set procedure_name = trim(p_procedure_name),
      procedure_kind = p_procedure_kind,
      anaesthesia = p_anaesthesia,
      animals_treated = p_animals_treated,
      duration_minutes = p_duration_minutes,
      premedication = nullif(trim(p_premedication), ''),
      induction_agent = nullif(trim(p_induction_agent), ''),
      maintenance_agent = nullif(trim(p_maintenance_agent), ''),
      analgesia = nullif(trim(p_analgesia), ''),
      monitoring = nullif(trim(p_monitoring), ''),
      pre_op_assessment = nullif(trim(p_pre_op_assessment), ''),
      post_op_instructions = nullif(trim(p_post_op_instructions), ''),
      complications = nullif(trim(p_complications), ''),
      outcome = coalesce(p_outcome, 'uneventful'),
      assistant = nullif(trim(p_assistant), ''),
      last_modified_by_device_id = coalesce(p_device_id, last_modified_by_device_id)
  where id = p_id and vet_id = v_vet_id and deleted_at is null;

  perform app_private.insert_audit_event(
    v_vet_id, 'surgical_procedure.updated', 'surgical_procedure', p_id, null, '{}'::jsonb
  );
end;
$$;

revoke all on function public.record_surgical_procedure(
  uuid, uuid, text, text, text, integer, timestamptz, integer, text, text, text,
  text, text, text, text, text, text, text, uuid
) from public;
grant execute on function public.record_surgical_procedure(
  uuid, uuid, text, text, text, integer, timestamptz, integer, text, text, text,
  text, text, text, text, text, text, text, uuid
) to authenticated;

revoke all on function public.update_surgical_procedure(
  uuid, text, text, text, integer, integer, text, text, text, text, text, text,
  text, text, text, text, uuid, bigint
) from public;
grant execute on function public.update_surgical_procedure(
  uuid, text, text, text, integer, integer, text, text, text, text, text, text,
  text, text, text, text, uuid, bigint
) to authenticated;
