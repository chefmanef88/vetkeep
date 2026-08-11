# VetKeep — Revised Developer Build Brief

**Document status:** Technical build specification  
**Product stage:** Pre-development architecture baseline  
**Revision date:** 11 July 2026 (Phase 2 scope correction 2 August 2026; product model correction 10 August 2026; build corrections 11 August 2026)  
**Primary market:** Independent solo veterinarians in Ghana and West Africa  
**Primary platforms:** Mobile application for clinical work; web application for account, public passport, and platform workflows

### Revision note — 11 August 2026

Corrections made after building §7. Earlier revision notes are left as written:
they record what was decided on the day, and this document follows the same rule
it imposes on clinical records — a later correction sits beside the original
rather than overwriting it.

1. **Stock counting is removed; the drug list stays.** The 10 August note (item 6)
   said administering a product would deduct a batch and record its lot number.
   That was built and then reversed. A solo veterinarian on a farm does not
   count what is in the boot of their car, and a quantity nobody maintains is
   worse than no quantity at all, because the low-stock warning derived from it
   becomes a lie. `inventory_items` remains as a **drug list**: what this
   veterinarian uses, what it contains, and what it obliges. Quantities,
   batches, expiry and low-stock warnings leave the specification. See §7.8.
2. **The examination set is derived from the species.** §7.3 previously fixed
   eleven mammalian systems for every animal. A budgerigar was offered Lymphatic
   and Urogenital and had nowhere to record a crop. A checklist that asks the
   wrong questions is worse than a short one: it invites "normal" against
   something that does not exist on the animal. See §7.3.
3. **Vaccination and deworming are one table.** `vaccinations` is replaced by
   `preventive_care`, which carries both. They are the same clinical act from
   the record's point of view — a product, a date, and a next due date — and
   splitting them would have duplicated every query. See §7.7.
4. **Dose is calculated, and the working is shown.** A dose rate and a body
   weight give a volume. The strength may come from the drug list or be typed
   off the bottle, and the record says which. See §7.10.
5. **Stock is not in the mobile application at all.** It was never a field task.
   The drug list is maintained on the web application.

**Known divergences between this document and the built schema**, stated rather
than quietly carried:

- `appointments`, `daily_routes`, `daily_route_stops`, `inventory_batches` and
  `inventory_movements` **still exist in the database**, along with their RPCs.
  §11 says scheduling is removed from scope, and it is removed from the mobile
  application, but the tables were never dropped and the web application still
  calls them. Removing scope did not remove schema. Until they are dropped, this
  document describes the intent and the schema describes the past.
- The `VK-R-` record code promised at the end of the 10 August note **is not
  implemented.** A shared document is currently identified by the patient code
  and the record date. The reasoning for a dedicated code stands; the code does
  not exist yet.

### Revision note — 10 August 2026

**VetKeep is a record-keeping product, not a scheduling product.** The document
previously described request-then-confirm appointments and daily route planning.
Those were built on an assumption that does not hold: that work arrives through
the application. It does not. A solo veterinarian is called by telephone or
email, agrees a time on that call, and drives. An appointment record would
mirror a negotiation that has already concluded elsewhere, and a status field
maintained for no reader is a liability rather than a record.

Seven changes follow from that.

1. **Scheduling is removed.** `appointments`, `daily_routes`, `daily_route_stops`
   and their controlled RPCs leave the specification. Consultations no longer
   depend on a booking. See §11, retained as a record of the decision.
2. **The patient record is a folder.** A folder holds standing information about
   an animal or a group, and an append-only series of dated consultation records
   beneath it. Standing information is editable for as long as the folder
   exists. Consultation records are never overwritten: a correction after
   signing is an amendment that is shown beside the original. See §6 and §8.
3. **Groups are in scope.** A folder is either an individual animal or a group —
   a flock, a herd, a pen. This reverses the v1 exclusion in §1.2. The group is
   the patient, and the clinical questions asked of it differ from those asked
   of one animal. See §6.2 and §7.9.
4. **Species pathways.** Companion, pet bird, food animal, and group each take
   the same SOAP skeleton with different objective findings and a different
   examination set. Body condition alone is scored 1–9 in dogs and cats and 1–5
   in ruminants; a single shared form silently loses which scale was meant. See
   §7.9.
5. **Withdrawal periods are mandatory for food-producing animals**, and are
   driven by the folder's stated purpose rather than by its species. A pet
   rabbit and a meat rabbit are the same species and carry different obligations.
   Milk, meat and egg withholding dates are computed and displayed, not typed
   into free text where nothing can read them. See §7.10.
6. **The drug formulary is the field inventory.** `inventory_items` gains active
   ingredient, route and standard withdrawal periods rather than a parallel drug
   list being introduced. What the veterinarian carries is what the veterinarian
   can administer; administering it deducts the batch, records the lot number
   against the animal, and computes the withholding dates in one action. See
   §7.10.
7. **A consultation record can be given to the client.** This is distinct from
   the public health passport in §10, which is deliberately restricted and never
   exposes clinical detail. An owner is entitled to the full record of their own
   animal, including notes, treatments and prescriptions, and may need it for a
   referral. See §10.5.

Consultation records now carry their own `VK-R-` code alongside the existing
client and patient series, because a document handed to a client needs a
reference that both parties can name.

### Revision note — 2 August 2026

Phase 2 scope was corrected and reprioritized after Phase 1 acceptance. Three changes from the original document:

1. **First vertical slice reprioritized.** Phase 2 now front-loads a complete end-to-end workflow — client → patient → house-call request → appointment/route → consultation → treatment/prescription → payment → follow-up — instead of building clinical records in isolation before scheduling and invoicing. This pulls forward elements originally sequenced in Phases 3, 4, and 6. See §24.
2. **Field inventory added to scope.** Lightweight tracking of drugs and consumables the vet personally carries (batch/expiry, low-stock warnings, per-visit consumption, restocking) is now in scope. This is a single-vet personal-stock feature, not a pharmacy or procurement system. See §7.8 and the updated §21 boundary.
3. **Future assistant/locum access acknowledged.** The tenant model already isolates data per `vet_id` in a way that could later accommodate a small number of assistant or locum seats without introducing clinic/branch concepts. Not implemented in v1. See §2.

---

## 1. Product Vision

VetKeep is a subscription-based clinical record-keeping platform built **exclusively for independent, solo veterinarians**, especially veterinarians who provide home-call, mobile, ambulatory, and field services.

The product is not a clinic-management system, and it is not a scheduling system. Work reaches the veterinarian by telephone or email; the application's job begins when the veterinarian arrives, and it is to produce a clinical record that is complete, durable, and defensible. It must remain faster, simpler, and more practical than systems designed for hospitals, chains, or multi-user clinics.

The unit of the product is the **folder**. A folder belongs to one animal or one group of animals, holds the standing facts about it, and accumulates a dated consultation record every time the veterinarian attends. Standing facts stay editable. Consultation records accumulate and are not rewritten. The folder is the thing a veterinarian searches for, reads before knocking on a door, adds to, and hands to a client on the way out.

Each veterinarian has one private account and owns the clinical relationship with every client and animal recorded in that account. The veterinarian creates, signs, and manages the complete medical record from first consultation through diagnosis, treatment, follow-up, and preventive care.

VetKeep is designed around the operating realities of Ghana and West Africa:

- Mobile phones are the primary work device.
- Connectivity may be slow, intermittent, or unavailable.
- WhatsApp is the dominant client communication channel.
- Mobile Money is the preferred subscription-payment method.
- Home and field visits require address, landmark, and travel information.
- A veterinarian must retain access to essential clinical history during connectivity or payment interruptions.

### 1.1 Product promise

A solo veterinarian must be able to:

1. Find a client, animal, or group quickly.
2. Open the folder and read the relevant history before knocking on the door.
3. Document a complete consultation offline, in the form the species calls for.
4. Capture diagnostic files and photographs offline.
5. Record vaccinations and dewormings with their due dates.
6. Record a treatment and be told, without calculating it, when milk, meat, or eggs are safe again.
7. Record a follow-up intention and be reminded of it.
8. Send reminders through WhatsApp when connected.
9. Produce a controlled public health passport.
10. Hand the client a copy of the consultation record before leaving.
11. Create a professional invoice without VetKeep handling the client's payment.
12. Trust that completed medical records cannot be silently altered or lost.

### 1.2 Non-negotiable product boundaries

VetKeep v1 is:

- Solo-veterinarian only.
- Single-seat per veterinarian account.
- Mobile-first and offline-first.
- Focused on clinical records, treatment and withdrawal tracking, reminders, passports, and simple invoicing.
- Suitable for companion animals, pet birds, individually identified food animals, and groups of food animals.

VetKeep v1 is not:

- A clinic, hospital, or branch-management platform.
- A multi-vet collaboration product.
- A client portal or client mobile app.
- An appointment book, a diary, or a route planner. Work is arranged by telephone and email, outside the product.
- A pharmacy, payroll, or insurance system, or a multi-location inventory system (lightweight personal field-supply tracking is in scope — see §7.8).
- A herd production-management system. Group **clinical** records are in scope; production performance, breeding cycles, feed conversion, and profitability are not.

A folder represents either one identifiable animal or one group of animals under common management. The distinction is recorded, because the clinical questions differ: an individual has a temperature, and a flock has a mortality rate.

---

## 2. Product and Tenancy Model

VetKeep has one authenticated veterinarian per account and no staff seats. This remains a deliberately simple product experience.

From a security and data-isolation perspective, VetKeep is still a **single-seat multi-tenant SaaS platform**:

- One tenant equals one veterinarian account.
- Each tenant has one authenticated veterinarian user.
- There are no clinic organizations, staff roles, or shared records in v1.
- Every private record is owned by exactly one `vet_id`.

This distinction must be preserved in the implementation because cross-account data exposure is a critical security risk even when every account has only one user.

The single-tenant-per-vet model is intentional groundwork for a possible future small-team extension (one assistant or locum per practice), not a permanent restriction. Adding that later should mean adding a bounded staff/role table scoped to an existing `vet_id`, not introducing clinic, branch, or organization concepts. No staff-seat schema exists in v1.

### 2.1 Internal platform administration

Internal VetKeep support and operations users are not tenant users and must not share the veterinarian application's authentication model.

Any future internal support console must:

- Use separate authentication.
- Apply least-privilege access.
- Require a documented support reason before opening tenant data.
- Record every support access in an immutable audit log.
- Mask clinical data by default.

An internal support console is not required for the first customer-facing release, but the database and audit design must not prevent one from being added safely.

---

## 3. Recommended Technology Architecture

### 3.1 Applications

```text
apps/
  mobile/
    React Native clinical application
    Offline local database
    Camera and attachment capture
    Background synchronization

  web/
    Marketing website
    Authentication and onboarding
    Account and subscription management
    Public health passport
    Data export and account workflows
    Server-side integration endpoints
```

### 3.2 Shared packages

```text
packages/
  domain/
    Clinical state transitions
    Record-locking rules
    Subscription entitlement rules

  contracts/
    API request and response types
    Sync mutation and checkpoint types
    Public passport DTOs

  validation/
    Shared Zod schemas

  database/
    Generated database types
    Query helpers
    Migration utilities

  sync/
    Mutation queue logic
    Conflict classification
    Checkpoint handling

  design-tokens/
    Colors, typography, spacing, radii, motion

  observability/
    Structured logging
    Error reporting wrappers
    Sensitive-data redaction
```

Do not force web and mobile to share presentation components. Share domain rules, validation, contracts, formatting utilities, and design tokens. Web and native user interfaces should use platform-appropriate components.

### 3.3 Technology decisions

- **Web:** Next.js App Router using a currently supported Active or Maintenance LTS release at implementation time.
- **Mobile:** React Native with TypeScript. Expo development builds may be used if the selected database and background-sync stack are fully supported; do not depend on Expo Go.
- **Database and authentication:** Supabase PostgreSQL, Supabase Auth, Row Level Security, and private Supabase Storage.
- **Styling:** Tailwind CSS on web. NativeWind or typed native design tokens may be used on mobile.
- **Validation:** Zod at application boundaries plus PostgreSQL constraints at the database boundary.
- **Hosting:** Vercel for web and server routes; Supabase for database, authentication, storage, and scheduled database work where appropriate.
- **Payments:** Hubtel integration for VetKeep subscription billing only.
- **Messaging:** Approved WhatsApp Business provider integration behind a provider-neutral messaging service.
- **Offline data:** RxDB is the preferred starting option, subject to the mandatory proof of concept in Phase 0. WatermelonDB is the fallback if React Native storage, licensing, bundle, performance, or replication requirements are not satisfied.

### 3.4 Simplicity principle

Do not introduce microservices, message brokers, Kubernetes, or a separate custom backend at launch.

Use:

- One PostgreSQL database.
- One web/server application.
- One mobile application.
- Database functions and small server-side integration endpoints.
- A database-backed outbox for reminders and integration jobs.

Extract separate services only when measured load, isolation requirements, or operational evidence justify them.

---

## 4. Global Data Standards

All private domain tables must include:

```sql
id uuid primary key,
vet_id uuid not null references vets(id),
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
deleted_at timestamptz,
server_version bigint not null default 1,
created_by_device_id uuid,
last_modified_by_device_id uuid
```

### 4.1 Identifier rules

- UUIDs are generated on the client when a record is created offline.
- The server never replaces a client-generated primary key.
- Human-readable client and patient codes must be collision-resistant and safe to generate offline.
- Do not rely on simple sequential codes for offline creation across multiple devices.

Recommended format:

```text
Client:  VK-C-7H2K9M
Patient: VK-P-4Q8T6R
```

The random segment should use an unambiguous uppercase alphabet such as Crockford Base32. Codes are unique per veterinarian account and are not security credentials.

### 4.2 Required database controls

Every schema migration must define:

- `NOT NULL` constraints for required fields.
- Foreign-key deletion behavior.
- Check constraints or database enums for statuses.
- Unique constraints scoped to `vet_id` where appropriate.
- Indexed foreign keys.
- Indexed tenant filters.
- Database-managed `updated_at` and `server_version` changes.
- Soft deletion for syncable and clinically relevant records.

### 4.3 Money and measurements

- Store platform and invoice money as integer pesewas or `numeric(12,2)`. Do not use floating-point types.
- Store currency explicitly, defaulting to `GHS`.
- Store units with measurements where ambiguity is possible.
- Weight should include a unit field even if kilograms are the default.
- Temperature should record the unit or enforce Celsius in the contract.

### 4.4 Phone numbers

Store:

- Original user-entered phone value for display.
- Normalized E.164 phone value for searching and messaging.
- WhatsApp capability or consent state separately.

---

## 5. Account, Profile, and Device Model

```sql
create table vets (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  full_name text not null,
  license_number text,
  license_verified boolean not null default false,
  phone_display text not null,
  phone_e164 text not null,
  whatsapp_display text,
  whatsapp_e164 text,
  business_name text,
  service_areas text[] not null default '{}',
  account_status text not null default 'active'
    check (account_status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table vet_devices (
  id uuid primary key,
  vet_id uuid not null references vets(id) on delete cascade,
  device_name text not null,
  platform text not null check (platform in ('ios', 'android')),
  app_version text,
  last_authenticated_at timestamptz not null,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (vet_id, id)
);
```

### 5.1 Offline authentication requirements

A registered device may open locally cached records offline for up to 30 days after its last successful online authentication.

The mobile app must:

- Store authentication tokens only in the operating system's secure credential store.
- Require device biometric unlock or a VetKeep local PIN.
- Lock after five minutes of inactivity by default.
- Refuse offline access when the device has been revoked and later receives the revocation state.
- Never store a service-role key or privileged database credential.
- Encrypt the local clinical database using an implementation supported by the selected storage stack.
- Clear local tenant data only after an authenticated logout or confirmed account removal workflow.

A user who forgets the local PIN must re-authenticate online. Local PIN recovery must not weaken data encryption.

---

## 6. Clients, Owners, and Patients

A patient row is the head of a **folder**. The folder is not a separate table: it
is the patient together with everything that references it — ownership history,
consultation records, attachments, preventive care, treatments.

```text
Client                    VK-C-3E1TA8
  └── Patient folder      VK-P-7KQM2P     individual or group
        ├── standing information          editable for the life of the folder
        ├── consultation record  VK-R-…   2026-03-14   signed
        ├── consultation record  VK-R-…   2026-06-02   signed
        └── consultation record  VK-R-…   2026-08-10   open
```

Standing information — identity, signalment, group size, allergies, chronic
conditions, ownership — is corrected in place as the veterinarian learns more.
Consultation records are appended and never rewritten; see §8 for the integrity
rules that apply once one is signed.

### 6.1 Clients

```sql
create table clients (
  id uuid primary key,
  vet_id uuid not null references vets(id) on delete restrict,
  client_code text not null,
  name text not null,
  phone_display text not null,
  phone_e164 text not null,
  whatsapp_display text,
  whatsapp_e164 text,
  email text,
  address text,
  location_latitude numeric(9,6),
  location_longitude numeric(9,6),
  communication_consent boolean not null default false,
  consent_recorded_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1,
  created_by_device_id uuid,
  last_modified_by_device_id uuid,
  unique (vet_id, client_code)
);
```

### 6.2 Patients

A patient is one animal or one group. Three columns decide how the rest of the
product behaves: `kind`, `species`, and `purpose`.

`purpose` is not decoration. It, and not species, determines whether withdrawal
periods apply. A pet rabbit and a meat rabbit are the same species and carry
entirely different obligations, and only the veterinarian knows which is in
front of them.

```sql
create table patients (
  id uuid primary key,
  vet_id uuid not null references vets(id) on delete restrict,
  patient_code text not null,
  name text not null,

  -- One animal, or a group under common management.
  kind text not null default 'individual'
    check (kind in ('individual', 'group')),
  species text not null
    check (species in (
      'dog', 'cat', 'bird',
      'cattle', 'sheep', 'goat', 'pig', 'poultry', 'rabbit',
      'other'
    )),
  -- Drives withdrawal obligations. 'pet' means the animal will not enter the
  -- food chain, whatever its species.
  purpose text not null default 'pet'
    check (purpose in ('pet', 'meat', 'milk', 'eggs', 'breeding', 'draught')),

  breed text,
  sex text
    check (sex is null or sex in ('male', 'female', 'male_neutered', 'female_spayed', 'unknown')),
  date_of_birth date,
  date_of_birth_precision text not null default 'exact'
    check (date_of_birth_precision in ('exact', 'estimated', 'unknown')),
  color_markings text,

  -- Identifiers differ by pathway: companions are chipped, food animals are
  -- tagged, birds are ringed. None is universal, so none is required.
  microchip_id text,
  ear_tag text,
  leg_ring text,
  identification_notes text,

  -- Group folders only. A count is a clinical denominator: "12 of 400 affected"
  -- means nothing without it.
  head_count integer check (head_count is null or head_count > 0),
  group_age_weeks integer check (group_age_weeks is null or group_age_weeks >= 0),
  housing text,

  status text not null default 'active'
    check (status in ('active', 'deceased', 'transferred', 'inactive')),
  deceased_at date,
  profile_photo_attachment_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1,
  created_by_device_id uuid,
  last_modified_by_device_id uuid,
  unique (vet_id, patient_code),

  -- A group must state how many. An individual must not carry a head count.
  constraint patients_group_requires_head_count check (
    (kind = 'group' and head_count is not null)
    or (kind = 'individual' and head_count is null)
  ),
  -- Sex is meaningful for one animal and not for a mixed flock.
  constraint patients_individual_requires_sex check (
    kind = 'group' or sex is not null
  )
);
```

Species and purpose together decide which withholding periods a treatment must
carry:

| Species        | Group folders | Milk | Meat | Eggs |
| -------------- | ------------- | ---- | ---- | ---- |
| dog, cat, bird | no            | —    | —    | —    |
| cattle         | yes           | ✓    | ✓    | —    |
| sheep, goat    | yes           | ✓    | ✓    | —    |
| pig            | yes           | —    | ✓    | —    |
| poultry        | yes           | —    | ✓    | ✓    |
| rabbit         | yes           | —    | ✓    | —    |

A folder whose `purpose` is `pet` never requires withholding, whatever its
species.

### 6.3 Patient ownership history

Do not store only one permanent `client_id` on the patient. Ownership and caregiving relationships can change.

```sql
create table patient_owners (
  id uuid primary key,
  vet_id uuid not null references vets(id) on delete restrict,
  patient_id uuid not null references patients(id) on delete restrict,
  client_id uuid not null references clients(id) on delete restrict,
  relationship text not null default 'owner',
  is_primary boolean not null default false,
  valid_from date not null default current_date,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1,
  created_by_device_id uuid,
  last_modified_by_device_id uuid,
  check (valid_to is null or valid_to >= valid_from)
);
```

Enforce no more than one active primary owner per patient with a partial unique index.

### 6.4 Search requirements

Search must work offline and online by:

- Client code.
- Patient code.
- Client name.
- Patient name.
- Normalized phone number.
- Microchip ID.

Search behavior:

1. Exact code, phone, and microchip matches first.
2. Prefix matches second.
3. Fuzzy name matches last.
4. Every server query is scoped by `vet_id`.
5. Results are paginated.
6. Duplicate names show species, owner, phone suffix, and patient code for disambiguation.

Indexes must support `vet_id` plus normalized search fields. PostgreSQL trigram indexes may be used for fuzzy name search.

---

## 7. Consultation Records

A consultation record is one dated entry in a folder. The `visits` table name is
retained to avoid a rename across a working schema, but the concept is a
consultation, not a scheduled appointment: `appointment_id` is dropped, and a
record is created by the act of attending, not by a booking.

Every record is a SOAP note. The columns already carry that structure:

| SOAP           | Columns                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------ |
| **S**ubjective | `chief_complaint`, `history_of_complaint`, `past_medical_history`, `current_medications`         |
| **O**bjective  | vitals, plus the examination findings in §7.3 and the group observations in §7.9                 |
| **A**ssessment | `problem_list`, `differential_diagnoses`, `tentative_diagnosis`, `definitive_diagnosis`          |
| **P**lan       | `treatment_plan`, `prescriptions`, the treatments in §7.10, `follow_up_plan`, `next_review_date` |

Each record carries a `VK-R-` code, generated on the device by the same
Crockford Base32 rules as client and patient codes (§4.1). The code is what a
veterinarian and a client name when they refer to a document that has left the
application.

### 7.1 Record lifecycle

```text
open -> signed
signed -> amended through a separate amendment record
any state -> voided with a mandatory reason
```

A record stays **open** and freely editable for as long as the veterinarian
needs — a consultation interrupted by a second call may be finished that
evening. Signing closes it.

A signed record is a medical record. It cannot be directly edited or deleted by
ordinary application operations. Corrections after signing are amendments, and
an amendment is displayed beside the original rather than replacing it. This is
the guarantee that makes the record worth keeping: a record that could be
quietly rewritten after an outcome is worth less than no record at all, because
it reads as concealment.

Signing is also what produces the client's copy (§10.5). The two are one action
in the interface — sign, and hand over — so that closing a record has an
immediate purpose rather than being an administrative step to remember.

### 7.2 Visits table

```sql
create table visits (
  id uuid primary key,
  vet_id uuid not null references vets(id) on delete restrict,
  patient_id uuid not null references patients(id) on delete restrict,
  visit_date timestamptz not null,
  visit_type text not null
    check (visit_type in ('home_call', 'clinic_visit', 'field_visit', 'emergency', 'follow_up', 'teleconsult')),
  workflow_status text not null default 'draft'
    check (workflow_status in ('draft', 'completed', 'voided')),

  chief_complaint text,
  history_of_complaint text,
  past_medical_history text,
  current_medications text,

  temperature_c numeric(4,1),
  heart_rate_bpm integer,
  respiratory_rate_bpm integer,
  weight_value numeric(8,2),
  weight_unit text not null default 'kg' check (weight_unit in ('kg', 'g')),
  body_condition_score text,
  pain_score text,

  problem_list text,
  differential_diagnoses text,
  tentative_diagnosis text,
  definitive_diagnosis text,

  treatment_plan text,
  prescriptions text,
  follow_up_plan text,
  next_review_date date,

  signed_at timestamptz,
  completed_at timestamptz,
  voided_at timestamptz,
  void_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1,
  created_by_device_id uuid,
  last_modified_by_device_id uuid,

  check (temperature_c is null or temperature_c between 20 and 50),
  check (heart_rate_bpm is null or heart_rate_bpm > 0),
  check (respiratory_rate_bpm is null or respiratory_rate_bpm > 0),
  check (weight_value is null or weight_value > 0),
  check (
    (workflow_status = 'completed' and signed_at is not null and completed_at is not null)
    or workflow_status <> 'completed'
  ),
  check (
    (workflow_status = 'voided' and void_reason is not null and voided_at is not null)
    or workflow_status <> 'voided'
  )
);
```

The database must reject direct updates to clinical content after `workflow_status = 'completed'`. Completion and amendment must occur through controlled database functions or trusted server operations.

### 7.3 Physical examination

A system must never default to `normal`. A normal finding means the veterinarian intentionally examined that system and found no abnormality.

```sql
create table physical_exam_findings (
  id uuid primary key,
  vet_id uuid not null references vets(id) on delete restrict,
  visit_id uuid not null references visits(id) on delete restrict,
  system_name text not null,
  status text not null default 'not_examined'
    check (status in ('not_examined', 'normal', 'abnormal', 'not_applicable')),
  remarks text,
  examined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1,
  created_by_device_id uuid,
  last_modified_by_device_id uuid,
  unique (visit_id, system_name)
);
```

**The set is derived from the folder's species and kind, never fixed.** A single
list for every animal asks a budgerigar about its lymphatic system and gives it
nowhere to record a crop; it asks a rabbit about everything except the teeth
that are the commonest reason a rabbit is presented at all. That is not merely
untidy. A checklist carrying systems the animal does not have invites `normal`
against something nobody looked at, because there was nothing to look at.

`system_name` is constrained to the union of every set below. Which subset is
seeded is decided on the server when the record is created, from the patient
row — not chosen by the veterinarian, and not sent by the client.

**Mammalian — dog, cat, and food animals.** The original eleven: General,
Cardiovascular, Respiratory, Gastrointestinal, Musculoskeletal, Integumentary,
Neurological, Ocular, Aural, Urogenital, Lymphatic.

**Rabbit.** The mammalian eleven **plus Dental**.

**Pet bird.** Eleven of its own: General, Beak and cere, Ocular, Crop,
Respiratory, Plumage, Keel, Wings, Vent, Musculoskeletal, Neurological. Aural,
Gastrointestinal and Lymphatic are not seeded.

**Group — flock, herd, pen.** **No systems at all.** A flock is assessed by head
count, number affected, mortality and post-mortem findings (§7.9), not by
palpating four hundred birds one at a time. The examination section is absent
from the record rather than present and empty; "all 0 examined" is not a
clinical statement.

All seeded rows start as `not_examined`.

Recording a finding validates against the same species-derived set, so a crop
finding is accepted on a bird and refused on a dog. The validation and the
seeding must read from one function; two lists drift.

Ordering is a display concern and belongs to the client, which sorts findings
head to tail — general impression, head, neck, chest, abdomen, hindquarters,
limbs. A query returns them alphabetically, which puts Aural before
Cardiovascular before Gastrointestinal, an order no clinician works in. An
examination followed down a screen is a checklist; one that jumps around the
animal is a lookup exercise, and systems get missed.

The user interface may provide an explicit **Mark all examined systems normal** action. This action must:

- Require a deliberate tap.
- Update only `not_examined` rows.
- Record the acting veterinarian, device, and timestamp.
- Remain editable until the visit is completed.

### 7.4 Clinical amendments

```sql
create table visit_amendments (
  id uuid primary key,
  vet_id uuid not null references vets(id) on delete restrict,
  visit_id uuid not null references visits(id) on delete restrict,
  reason text not null,
  amendment_text text not null,
  structured_changes jsonb,
  signed_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by_device_id uuid
);
```

An amendment appends clarification or correction without overwriting the original signed record. The rendered medical record must show the original entry and every later amendment chronologically.

### 7.5 Diagnostics

```sql
create table diagnostics (
  id uuid primary key,
  vet_id uuid not null references vets(id) on delete restrict,
  visit_id uuid not null references visits(id) on delete restrict,
  diagnostic_type text not null,
  sample_type text,
  test_requested text,
  imaging_requested text,
  status text not null default 'requested'
    check (status in ('requested', 'sample_collected', 'pending', 'completed', 'cancelled')),
  result_notes text,
  requested_at timestamptz,
  resulted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1,
  created_by_device_id uuid,
  last_modified_by_device_id uuid
);
```

### 7.6 Attachments

Medical files must use private storage. Do not persist public URLs.

```sql
create table attachments (
  id uuid primary key,
  vet_id uuid not null references vets(id) on delete restrict,
  patient_id uuid references patients(id) on delete restrict,
  visit_id uuid references visits(id) on delete restrict,
  diagnostic_id uuid references diagnostics(id) on delete restrict,
  storage_bucket text not null,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  checksum_sha256 text,
  attachment_type text not null,
  upload_status text not null default 'pending'
    check (upload_status in ('pending', 'uploading', 'uploaded', 'failed')),
  captured_at timestamptz,
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1,
  created_by_device_id uuid,
  last_modified_by_device_id uuid,
  check (patient_id is not null or visit_id is not null or diagnostic_id is not null)
);
```

Storage paths must begin with the tenant's `vet_id`. Access is granted through short-lived signed URLs after authorization.

The mobile app must preserve the local file until the server confirms the checksum and marks the upload complete.

### 7.7 Preventive care — vaccination and deworming

Vaccination and deworming are one table, not two. From the record's point of
view they are the same act: a product, a dose, a date, and a date it is next
due. Splitting them would duplicate every query that asks the only question
that matters here — _what is this animal due for?_ — and that question does not
care which of the two it is.

```sql
create table preventive_care (
  id uuid primary key,
  vet_id uuid not null references vets(id) on delete restrict,
  patient_id uuid not null references patients(id) on delete restrict,
  visit_id uuid references visits(id) on delete restrict,

  kind text not null check (kind in ('vaccination', 'deworming')),
  -- Vaccination only, and filtered by species: DHLPP and anti-rabies for a dog,
  -- FPL and Tricat for a cat. Offering a cat DHLPP is an error the list should
  -- not permit in the first place.
  vaccine_type text,
  product_name text not null,
  manufacturer text,
  batch_lot_number text,
  dose text,
  route text,
  -- Group treatment: how many animals received it.
  animals_treated integer check (animals_treated is null or animals_treated > 0),

  date_given date not null,
  next_due_date date,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1,
  created_by_device_id uuid,
  last_modified_by_device_id uuid,
  check (next_due_date is null or next_due_date >= date_given),
  check (kind = 'vaccination' or vaccine_type is null)
);
```

Rules:

- **The batch or serial number is the point.** In a vaccine failure or a rabies
  investigation, the batch is the first thing asked for. It is a field, not a
  line in `notes`.
- **`vaccine_type` is filtered by species.** A record must not offer a vaccine
  that is not given to the animal in front of the veterinarian.
- **Routes differ by kind.** Deworming includes **oral**, which most tablets and
  suspensions are; a route list borrowed from injectable vaccines would have
  omitted the commonest case.
- `next_due_date` is what drives the reminders in §12. A preventive care row
  with no next due date is a completed act with no future obligation, which is
  a legitimate state and not a missing field.

**Expiry date is not recorded here.** It belonged to the batch tracking removed
in §7.8. The batch number identifies the product; the expiry of a vial already
administered changes nothing that can now be acted on.

### 7.8 The drug list

**This is a list of products, not a count of them.** Stock tracking was
specified, built, and removed. The reasoning is worth keeping, because the
feature is an easy one to propose again.

A solo veterinarian restocking from the boot of their car does not count
anything. Quantities would be maintained on the first day, sporadically in the
first week, and never afterwards. That is not a small failure: a low-stock
warning derived from an unmaintained quantity is not merely useless, it is
wrong, and a warning that is wrong trains the person reading it to ignore
warnings. Deducting stock automatically at the point of treatment does not
rescue it either, because it only counts what leaves through a recorded
consultation — not what was spilled, expired, given away, or used on the
veterinarian's own animals.

What the drug list is for is the opposite direction. It does not tell the
veterinarian what they have. It tells the record what a product **obliges**:
its active ingredient, its usual route, its strength, and the withholding
periods it imposes on a food animal. Those are properties of the product, they
do not change with use, and they are the ones a record cannot be written
correctly without.

```sql
create table inventory_items (
  id uuid primary key,
  vet_id uuid not null references vets(id) on delete restrict,
  item_name text not null,
  item_type text not null check (item_type in ('drug', 'consumable', 'vaccine', 'other')),
  unit text not null,
  active boolean not null default true,

  active_ingredient text,
  default_route text
    check (default_route is null or default_route in (
      'oral', 'im', 'iv', 'sc', 'topical', 'intramammary', 'in_water', 'in_feed'
    )),

  -- Strength, for the dose calculation in §7.10. Percentage is w/v and is
  -- converted once, centrally: 20% is 200 mg/ml, and getting that wrong by a
  -- factor of ten is the classic way to overdose an animal.
  concentration_value numeric(10,3) check (concentration_value is null or concentration_value > 0),
  concentration_unit text
    check (concentration_unit is null or concentration_unit in (
      'mg_per_ml', 'percent', 'iu_per_ml', 'mg_per_g'
    )),
  check (
    (concentration_value is null and concentration_unit is null)
    or (concentration_value is not null and concentration_unit is not null)
  ),

  -- Standard withholding periods for this product, in days. Null means the
  -- product carries none; it does not mean zero, and the two must not be
  -- conflated when a treatment is recorded.
  withdrawal_meat_days integer check (withdrawal_meat_days is null or withdrawal_meat_days >= 0),
  withdrawal_milk_days integer check (withdrawal_milk_days is null or withdrawal_milk_days >= 0),
  withdrawal_eggs_days integer check (withdrawal_eggs_days is null or withdrawal_eggs_days >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1,
  created_by_device_id uuid,
  last_modified_by_device_id uuid,
  unique (vet_id, item_name)
);
```

Rules:

- **No quantities, no batches, no expiry, no low-stock warnings.**
  `inventory_batches` and `inventory_movements` leave the specification. A
  treatment does not deduct anything.
- **The drug list is maintained on the web application, not on mobile.**
  Entering a formulary is deskwork done once, sitting down, from a data sheet —
  not something done on a phone in the sun with a dog under one arm. The mobile
  application reads the list and never edits it, with one deliberate exception:
  a missing strength may be filled in from the consultation that exposed it
  (§7.10).
- A product not on the list can still be administered and recorded. The list is
  a convenience, never a gate: a veterinarian who used a bottle a client
  supplied must be able to record that they used it.

**Not in scope, and deliberately:** purchasing, pricing, suppliers, reorder
levels, multi-location stock, or anything resembling a pharmacy. See §21.

### 7.9 Species pathways

Four pathways share the SOAP skeleton and differ in what the Objective section
asks and which examination set applies. The pathway is derived from the folder's
`kind` and `species`; it is never a separate choice the veterinarian has to
remember to make.

**Companion — dog, cat.** The eleven examination systems in §7.3 apply
unchanged. Body condition is scored 1–9. Weight in kilograms. Identity by
microchip.

**Pet bird.** Weight in **grams** — `weight_unit` already permits this, and a
budgerigar recorded in kilograms is recorded uselessly. Body condition is a
keel score of 1–5, not the 1–9 mammalian scale. Rectal temperature is not taken
routinely. Identity by leg ring. The examination set replaces the mammalian
systems that do not apply with: Beak and cere, Crop, Plumage, Keel, Vent, Wings,
retaining General, Respiratory, Ocular, Neurological, and Musculoskeletal.

**Food animal, individual — one cow, ewe, doe, sow, or rabbit.** Body condition
is scored **1–5**. Identity by ear tag. Ruminants additionally record rumen fill;
rabbits additionally record a Dental system, since incisor and molar overgrowth
is among their commonest presentations and the eleven mammalian systems have
nowhere to put it. Lactation and pregnancy status are recorded where relevant to
the species and purpose. Withdrawal periods apply per §7.10.

**Group — flock, herd, pen.** A group is not examined system by system. The
Objective section records instead:

- head count at the time of attendance, and **number affected**
- deaths today and cumulative deaths in the current episode
- feed and water intake, and any change in them
- production change where the purpose implies one — a drop in lay, a drop in yield
- housing, litter, ventilation, and stocking observations
- post-mortem findings on animals examined after death

Morbidity and mortality are derived from the counts rather than typed, so they
cannot disagree with them. Treatment is usually applied to the whole group, in
feed or in water, and withdrawal applies to every animal in it.

Body condition scales must never be shared across pathways as a single free-text
field without the scale being recorded. A "4" means an overweight dog and a fat
cow, and the two are not comparable.

### 7.10 Treatments, the formulary, and withdrawal periods

Free text cannot answer the question a farmer actually asks: _when is the milk
safe?_ A treatment must therefore be a structured row, not a sentence inside
`treatment_plan`.

**The formulary is the drug list** (§7.8), extended rather than duplicated.
Selecting a carried product fills in its route, its strength and its withholding
periods; it does **not** deduct anything, and nothing is counted. See §7.8 for
why stock tracking was removed after being built.

```sql
create table treatments (
  id uuid primary key,
  vet_id uuid not null references vets(id) on delete restrict,
  visit_id uuid not null references visits(id) on delete restrict,
  patient_id uuid not null references patients(id) on delete restrict,

  -- Products carried are linked; a product the client buys elsewhere is named.
  inventory_item_id uuid references inventory_items(id) on delete restrict,
  product_name text not null,
  active_ingredient text,

  dose_value numeric(10,3) not null check (dose_value > 0),
  dose_unit text not null,
  route text not null
    check (route in ('oral', 'im', 'iv', 'sc', 'topical', 'intramammary', 'in_water', 'in_feed')),
  administered_at timestamptz not null,
  duration_days integer check (duration_days is null or duration_days > 0),
  -- For group treatment: how many animals received it.
  animals_treated integer check (animals_treated is null or animals_treated > 0),

  -- How the volume was arrived at, stored so the dose can be rechecked later.
  -- A volume on its own cannot be: 12 ml is not a claim anyone can verify.
  dose_rate_value numeric(10,3) check (dose_rate_value is null or dose_rate_value > 0),
  dose_rate_unit text
    check (dose_rate_unit is null or dose_rate_unit in ('mg_per_kg', 'ml_per_kg', 'iu_per_kg')),
  weight_kg_used numeric(8,3) check (weight_kg_used is null or weight_kg_used > 0),
  concentration_value numeric(10,3) check (concentration_value is null or concentration_value > 0),
  concentration_unit text
    check (concentration_unit is null or concentration_unit in (
      'mg_per_ml', 'percent', 'iu_per_ml', 'mg_per_g'
    )),
  -- Whether the drug list vouched for the strength or it was read off the
  -- bottle at the visit. Only a formulary strength can be re-derived if the
  -- product's entry is later corrected, so the two are not interchangeable.
  concentration_source text
    check (concentration_source is null or concentration_source in ('formulary', 'manual')),
  check (
    (concentration_value is null and concentration_source is null)
    or (concentration_value is not null and concentration_source is not null)
  ),

  -- Computed on write from the product's standard periods and the last day of
  -- administration, then stored. Storing the resolved date rather than the
  -- period means a later correction to the formulary cannot silently move a
  -- withholding date that has already been given to a farmer in writing.
  meat_withhold_until date,
  milk_withhold_until date,
  eggs_withhold_until date,
  withdrawal_source text not null default 'formulary'
    check (withdrawal_source in ('formulary', 'manual', 'none_required')),

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1,
  created_by_device_id uuid,
  last_modified_by_device_id uuid
);
```

Rules:

- A treatment recorded against a folder whose `purpose` is not `pet` must resolve
  every withholding period applicable to that species (§6.2), either from the
  formulary or by explicit manual entry. `withdrawal_source = 'none_required'`
  is an assertion the veterinarian makes deliberately, not a default.
- Withholding dates are computed from the **last** day of administration, not the
  first.
- Active withholding must be displayed on the folder, on the consultation record,
  and on the client's copy. A date buried in a list is not displayed.
- Treatments follow §15 offline rules and use the same client-minted identifier
  and idempotency mechanism as the rest of a consultation, so a retried sync
  cannot record a dose twice.

#### Dose calculation

Rate times weight gives the amount of drug; divided by the strength of the
bottle it gives the volume in the syringe. A veterinarian does this in their
head all day, and it is also where a decimal point goes missing at the end of a
long day, on a phone, in the sun, holding a dog.

- **The working is shown beside the result**, always. `20 mg/kg × 30 kg = 600 mg
÷ 200 mg/ml = 3 ml`. A calculated number with no derivation is a number nobody
  can check, and an uncheckable number in a clinical record is worse than an
  arithmetic error, because it carries the authority of having been computed.
- **The calculated volume is never written into the dose silently.** It is
  offered, and the veterinarian taps to accept it.
- **Percentage is w/v and is converted centrally**: 20% is 20 g in 100 ml, which
  is 200 mg/ml. This conversion must exist in exactly one place. It is displayed
  as `20% (200 mg/ml)`, because that conversion is the step a reader most needs
  to be able to check.
- **A rate in ml/kg needs no strength.** When the label says how much liquid to
  give, the concentration of the bottle is irrelevant.
- **IU and mg do not convert.** An IU dose requires a strength in IU/ml; there
  is no ratio between them that holds without knowing the specific product.
- **The strength may be typed** when the product is not on the drug list, or is
  on it without a strength. Refusing to calculate for an unfamiliar product
  withholds the arithmetic precisely where an unfamiliar product makes it most
  valuable. A strength typed against a carried product may be saved back to the
  drug list, but only where the field was empty — correcting a strength already
  on file is a deliberate act belonging on the products screen, not a side
  effect of a consultation.
- **Implausible strengths warn; they never refuse.** Unusual products exist and
  a veterinarian who knows their bottle must not be argued with.

**A limit worth stating plainly.** No range check can catch a bottle of 20%
entered as `20 mg/ml`. That understates the strength tenfold and so gives ten
times the volume — but 20 mg/ml is itself a perfectly ordinary strength, and
nothing distinguishes the two readings. Validation cannot solve this. The
defence is the working shown beside the result, where `20 mg/ml` and
`20% (200 mg/ml)` read differently at a glance. Any future claim that the app
"validates" doses should be measured against this case.

---

## 8. Clinical Record Integrity and Audit

### 8.1 Audit log

```sql
create table audit_events (
  id uuid primary key default gen_random_uuid(),
  vet_id uuid,
  actor_auth_user_id uuid,
  actor_device_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  reason text,
  request_id text,
  ip_hash text,
  created_at timestamptz not null default now()
);
```

Audit events are append-only. Tenant users cannot update or delete them.

At minimum, audit:

- Login and failed authentication events.
- Device registration and revocation.
- Visit completion.
- Visit voiding.
- Every clinical amendment.
- Passport enablement, consent change, and slug rotation.
- Subscription state changes.
- Data exports.
- Support access.
- Account closure.

Avoid storing unnecessary sensitive data in logs. Structured application logs must redact clinical note bodies, tokens, authorization headers, and payment credentials.

### 8.2 Deletion policy

- Draft records may be soft-deleted.
- Completed visits, preventive care, invoices, payment records, and audit events cannot be hard-deleted through the tenant application.
- An erroneous completed visit is voided with a reason; it is not erased.
- Account closure follows the documented retention and export policy.

**Three distinct actions, deliberately not merged.** "Delete" means different
things to a veterinarian depending on what is in front of them, and collapsing
them would either forbid something reasonable or permit something irreversible.

| Action              | What it does                                                                                | Reversible                                                               |
| ------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Discard a **draft** | Removes a consultation that was never signed                                                | No, but nothing clinical is lost — an unsigned record was never a record |
| **Void a record**   | A signed consultation is marked void with a stated reason and stays visible, struck through | Not erased; the void is itself the record                                |
| **Delete a folder** | The whole patient folder is soft-deleted with its records                                   | Recoverable server-side; audited                                         |

Every one of the three writes an audit event carrying the reason. A signed
record is never silently removed, and no action erases clinical history: voiding
adds a statement that something was wrong, which is more informative than the
absence a deletion would leave.

**Drafts in progress are a separate mechanism.** Typing that has not been saved
is held on the device so that navigating away or closing the application does
not lose it. This is deliberately not the offline sync queue: the queue owns
work the veterinarian has committed to and that is owed to the server, whereas
an in-progress draft is owed to nobody and must never sync. Once the queue owns
the work, the device-local draft is cleared. Conflating the two would either
push half-typed clinical notes to the server or lose a note that was never
pushed.

---

## 9. Row Level Security and Tenant Isolation

Every private table must contain an immutable `vet_id`.

### 9.1 Ownership function

Create a stable database function that resolves the authenticated veterinarian:

```sql
create or replace function current_vet_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from vets
  where auth_user_id = auth.uid()
  limit 1;
$$;
```

Restrict execution appropriately and review all `security definer` functions for safe `search_path` usage.

### 9.2 Standard private-table policy

```sql
using (vet_id = current_vet_id())
with check (vet_id = current_vet_id())
```

The server must not trust a `vet_id` sent by the client. Insert and update operations must derive or validate ownership from the authenticated session.

### 9.3 Parent-child ownership consistency

Database triggers or controlled functions must reject a child record whose `vet_id` differs from its parent visit, patient, treatment, diagnostic, or invoice.

### 9.4 RLS test requirement

Every migration introducing a tenant table must include automated tests proving:

- Vet A can read and change only Vet A's permitted rows.
- Vet B cannot infer Vet A's rows through direct IDs, joins, counts, storage paths, RPC functions, or error messages.
- Anonymous users cannot query any private medical table.
- Service-role operations are limited to trusted server environments.

---

## 10. Public Health Passport

The health passport is a controlled public proof-of-care page. It is not a complete medical record and must not expose private clinical content.

### 10.1 Public URL

```text
https://vetkeep.app/passport/{public-token}
```

The raw public token must be high entropy. Store only a cryptographic hash of the token where practical.

Do not use the patient ID, patient code, phone number, or predictable sequence as the public token.

### 10.2 Passport configuration

```sql
create table patient_passports (
  id uuid primary key,
  vet_id uuid not null references vets(id) on delete restrict,
  patient_id uuid not null unique references patients(id) on delete restrict,
  token_hash text not null unique,
  enabled boolean not null default false,
  owner_name_visibility text not null default 'hidden'
    check (owner_name_visibility in ('hidden', 'first_name', 'full_name')),
  consent_confirmed boolean not null default false,
  consent_confirmed_at timestamptz,
  consent_notes text,
  enabled_at timestamptz,
  revoked_at timestamptz,
  rotated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Passports are disabled by default until owner consent is recorded.

### 10.3 Allowed public fields

The public response may include only:

- Patient photo.
- Patient name.
- Species.
- Breed.
- Sex.
- Date of birth or approximate age.
- Color and identifying markings.
- Patient code.
- Microchip ID only when explicitly enabled.
- Owner name according to consent setting.
- Vaccination name, date given, and next due date.
- High-level recent visit date, reason, and final diagnosis only when the vet marks that visit as passport-visible.
- Verifying veterinarian name, business name, and license-verification status.
- Last updated timestamp.

Never expose:

- Full SOAP notes.
- Physical examination details.
- Differentials.
- Treatment plans.
- Prescriptions.
- Diagnostic files.
- Client phone, email, or address.
- Internal database identifiers.

### 10.4 Public access architecture

Anonymous users must not receive direct `SELECT` access to `patients`, `clients`, `visits`, `preventive_care`, or `attachments`.

Implement a server-side passport endpoint that:

1. Validates and hashes the supplied token.
2. Applies IP and token rate limits.
3. Loads an explicit public DTO through a restricted database function or trusted server query.
4. Returns only allow-listed fields.
5. Records a privacy-safe access event.
6. Sends `noindex, nofollow` metadata by default.
7. Uses cache settings that do not preserve a revoked passport for an unsafe duration.

### 10.5 QR codes and token rotation

The QR code encodes the current passport URL.

Token rotation invalidates previously printed QR codes, so rotation is an emergency revocation action rather than routine maintenance. The interface must warn the veterinarian before rotation.

### 10.6 The client's copy of a record

This is **not** the passport, and the two must never share an implementation.
The passport is a link for a third party — a groomer, a boarding kennel — and is
restricted by §10.3 to identity and vaccination status. The client's copy is a
document handed to the owner of the animal, who is entitled to the full clinical
record and may need it for a referral, a sale, or a second opinion.

The client's copy contains the whole record: identity, the full SOAP note,
examination findings, treatments with doses and routes, prescriptions,
**active withholding dates**, follow-up plan, and any amendments shown as
amendments. It carries the veterinarian's name, business name, licence number,
and the record's `VK-R-` code.

Requirements:

- **Generated on the device.** A veterinarian standing on a farm with no signal
  must still be able to hand over the record. Generation must not require a
  server round trip.
- **A signed record only.** An open record is a draft and must not leave the
  application.
- **Two ranges.** One consultation, which is the ordinary case, or the folder's
  full history, which matters when an animal transfers to another veterinarian.
- **Sharing is a disclosure and is audited.** The audit event records that a
  record was shared and when. It does not record the document or the recipient's
  message. If a client later disputes what they were told, the record of
  disclosure is the answer.
- **Deliberate.** Sending clinical information out of the application is an
  explicit action, never a side effect of signing or of any background process.

---

## 11. Scheduling and Route Planning — Removed

This section previously specified request-then-confirm appointments and daily
route planning with manual and nearest-neighbour stop ordering. It is retained
as a heading so that references elsewhere in this document remain resolvable,
and as a record of why the capability is absent rather than merely unbuilt.

**The assumption was wrong.** Scheduling was specified as though requests reach
the veterinarian through the application. They do not. A solo veterinarian is
called by telephone or email, agrees a time during that call, and drives. An
`appointments` row would have recorded the outcome of a negotiation that
concluded elsewhere, and a status field with no reader is an obligation to
maintain rather than information.

Removed from scope:

- `appointments`, and the transitions `requested -> confirmed -> completed` with
  their decline, reschedule, cancel, and no-show branches
- `daily_routes`, `daily_route_stops`, and stop sequencing
- `create_appointment`, `update_appointment_details`,
  `transition_appointment_status`, `upsert_daily_route`, `add_route_stop`,
  `remove_route_stop`, `resequence_route_stops`

A consultation record no longer references an appointment. It is created by the
act of attending; see §7.

**Removed from scope is not removed from the schema.** As of 11 August 2026 all
of the tables and functions listed above still exist in the database, and the
web application still calls them. What has actually happened is that the mobile
application no longer offers scheduling and a consultation no longer depends on
a booking. Dropping the tables is outstanding work, and until it is done a
reader should treat this section as the intent and the migrations as the record.

**What survives.** Follow-up intent does not require an appointment. A record
carries `follow_up_plan` and `next_review_date` (§7), and those drive reminders
through §12. The veterinarian is reminded that an animal is due; nothing
purports to know what their day looks like.

Route optimisation may return if usage demonstrates the need. It should not
return by way of an appointment table.

## 12. WhatsApp Reminders and Messaging Outbox

Do not use a single `sent boolean`.

### 12.1 Reminder definitions

Reminders no longer hang off an appointment (§11). What is worth reminding a
client about is a **due date** the veterinarian recorded: a follow-up
(`next_review_date` on a consultation record), a vaccination due date, or the
end of a withholding period. Each is a fact the veterinarian asserted, which is
why it can be sent without a booking existing.

```sql
create table client_reminders (
  id uuid primary key,
  vet_id uuid not null references vets(id) on delete restrict,
  -- What is being reminded about. Exactly one target is set, and the reminder
  -- is cancelled if its target is voided or deleted.
  reminder_type text not null
    check (reminder_type in ('follow_up', 'vaccination_due', 'withdrawal_ends')),
  visit_id uuid references visits(id) on delete cascade,
  preventive_care_id uuid references preventive_care(id) on delete cascade,
  treatment_id uuid references treatments(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  send_at timestamptz not null,
  channel text not null default 'whatsapp'
    check (channel in ('whatsapp')),
  template_key text not null,
  template_version text not null,
  recipient_e164 text not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'sent', 'delivered', 'read', 'failed', 'cancelled')),
  provider_message_id text,
  attempt_count integer not null default 0,
  last_error_code text,
  last_error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint client_reminders_one_target check (
    (visit_id is not null)::int
    + (vaccination_id is not null)::int
    + (treatment_id is not null)::int = 1
  )
);
```

A `withdrawal_ends` reminder is addressed to the farmer and is the one message
in this system with a food-safety consequence. It must not be silently dropped
when a send fails; a permanently failed withdrawal reminder is surfaced to the
veterinarian, who can telephone instead.

### 12.2 Outbox pattern

Signing a consultation record and creating any reminders it implies must be committed in the same database transaction.

A scheduled worker claims due reminders with row locking, sends through the configured provider, and updates status idempotently.

Requirements:

- Exponential retry with a maximum attempt count.
- Dead-letter visibility for permanently failed messages.
- Provider callback verification.
- Duplicate callback handling.
- Message-template version tracking.
- Communication consent enforcement.
- No clinical details in reminders beyond the minimum necessary description of what is due.

---

## 13. Billing Layer 1 — VetKeep Subscription

### 13.1 Commercial model

- 14-day free trial.
- Full product functionality during trial.
- Monthly and yearly plans may be supported.
- Hubtel is used only for VetKeep subscription payments.
- Client invoices are separate and never processed by VetKeep.

Do not assume that unattended recurring Mobile Money debit is available. Phase 0 must confirm the exact Hubtel mechanism and choose one supported renewal mode:

- Provider-managed recurring debit.
- Monthly customer approval prompt.
- Payment link or checkout initiated by the veterinarian.
- Prepaid subscription credit.

The rest of the subscription system must be provider-neutral.

### 13.2 Plans and subscriptions

```sql
create table plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  price_monthly_pesewas bigint,
  price_yearly_pesewas bigint,
  currency text not null default 'GHS',
  features jsonb not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  vet_id uuid not null unique references vets(id) on delete restrict,
  plan_id uuid not null references plans(id) on delete restrict,
  status text not null
    check (status in ('trialing', 'active', 'grace_period', 'past_due', 'cancelled')),
  billing_cycle text not null
    check (billing_cycle in ('monthly', 'yearly')),
  renewal_mode text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  grace_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 13.3 Payments and webhook events

```sql
create table subscription_payments (
  id uuid primary key default gen_random_uuid(),
  vet_id uuid not null references vets(id) on delete restrict,
  subscription_id uuid not null references subscriptions(id) on delete restrict,
  amount_pesewas bigint not null check (amount_pesewas > 0),
  currency text not null default 'GHS',
  provider text not null default 'hubtel',
  provider_transaction_id text,
  provider_reference text not null,
  idempotency_key text not null unique,
  status text not null
    check (status in ('initiated', 'pending', 'successful', 'failed', 'reversed', 'cancelled')),
  failure_code text,
  failure_message text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_reference)
);

create table integration_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  signature_valid boolean not null,
  payload_hash text not null,
  processing_status text not null
    check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id)
);
```

Do not store raw payment secrets or unnecessary full callback payloads in long-term logs.

### 13.4 Reconciliation

Subscription status cannot depend only on a daily expiry job.

Required controls:

- Verify every provider callback signature.
- Process callbacks idempotently.
- Reconcile unresolved transactions against the provider.
- Run a daily subscription-state consistency job.
- Maintain payment-attempt history.
- Alert operations when payment and subscription state disagree.
- Never mark a payment successful only because the client application reports success.

### 13.5 Past-due behavior

When the server confirms a subscription is past due:

- Existing records remain readable.
- Existing locally queued clinical writes created before confirmation are accepted and synchronized to avoid data loss.
- New record creation is disabled after the mobile app receives the confirmed past-due state.
- Data export and subscription-payment screens remain available.
- Public passports already enabled may remain accessible during a short configurable grace period.

A device must never enter past-due mode solely because it is offline or because its entitlement cache expired.

---

## 14. Billing Layer 2 — Client Invoicing

VetKeep records invoices for the veterinarian. VetKeep does not process, hold, or take a percentage of this money.

### 14.1 Normalized invoice model

```sql
create table visit_invoices (
  id uuid primary key,
  vet_id uuid not null references vets(id) on delete restrict,
  visit_id uuid references visits(id) on delete restrict,
  client_id uuid not null references clients(id) on delete restrict,
  invoice_number text not null,
  currency text not null default 'GHS',
  subtotal_pesewas bigint not null default 0,
  discount_pesewas bigint not null default 0,
  total_pesewas bigint not null default 0,
  amount_paid_pesewas bigint not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'unpaid', 'partial', 'paid', 'voided')),
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1,
  created_by_device_id uuid,
  last_modified_by_device_id uuid,
  unique (vet_id, invoice_number),
  check (subtotal_pesewas >= 0),
  check (discount_pesewas >= 0),
  check (total_pesewas >= 0),
  check (amount_paid_pesewas >= 0 and amount_paid_pesewas <= total_pesewas)
);

create table invoice_items (
  id uuid primary key,
  vet_id uuid not null references vets(id) on delete restrict,
  invoice_id uuid not null references visit_invoices(id) on delete cascade,
  description text not null,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_price_pesewas bigint not null check (unit_price_pesewas >= 0),
  line_total_pesewas bigint not null check (line_total_pesewas >= 0),
  sequence_number integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table invoice_payments (
  id uuid primary key,
  vet_id uuid not null references vets(id) on delete restrict,
  invoice_id uuid not null references visit_invoices(id) on delete restrict,
  amount_pesewas bigint not null check (amount_pesewas > 0),
  method text not null check (method in ('cash', 'momo', 'bank_transfer', 'card_external', 'other')),
  reference text,
  paid_at timestamptz not null,
  notes text,
  created_at timestamptz not null default now()
);
```

Invoice totals and status must be recalculated by trusted domain logic, not accepted directly from the client without validation.

### 14.2 Invoice lifecycle

An invoice is created as `draft` so the veterinarian can assemble line items during the visit, as charges accrue, without the partial invoice counting toward outstanding balances. Issuing it moves `draft -> unpaid`, at which point it becomes a real receivable. Payments then move it to `partial` or `paid`.

Voiding is permitted even when payments have already been recorded. The payment rows are preserved and the amount paid is captured in the audit metadata. VetKeep does not process this money and provides no reversal or refund operation, so blocking the void would leave the veterinarian holding an uncorrectable invoice with no path forward. The void reason is mandatory and forms the written record of how the money was handled.

Completed invoices and payment records are never hard-deleted by the tenant application, per §8.2.

---

## 15. Offline-First Mobile Architecture

### 15.1 Core principle

The mobile application must remain clinically useful with zero connectivity. The server is the authoritative shared state and backup target, but it must not be required to open a patient, search local records, or document a consultation.

### 15.2 Mandatory Phase 0 proof of concept

Before full feature development, prove the selected local database and sync approach with:

1. One veterinarian on two physical devices.
2. Offline creation of clients, patients, visits, and exam findings.
3. App restart and device reboot without data loss.
4. Push and pull of at least 10,000 records.
5. Soft deletion and tombstones.
6. Competing edits to the same draft SOAP section.
7. Completion and locking of a visit.
8. Offline photo capture and resumable upload.
9. Schema migration while unsynced records exist.
10. Revoked-device behavior.

Do not continue to full feature implementation until this proof of concept passes.

### 15.3 Server sync metadata

Every syncable row uses:

```text
id
vet_id
server_version
created_at
updated_at
deleted_at
created_by_device_id
last_modified_by_device_id
```

Do not store device-specific `sync_status` in the server row. Sync state differs by device and belongs in the local database.

### 15.4 Local sync tables

The mobile database must maintain at least:

```text
sync_checkpoints
  collection_name
  last_server_cursor
  last_successful_sync_at

outbound_mutations
  mutation_id
  entity_type
  entity_id
  operation
  payload
  base_server_version
  created_at
  attempt_count
  last_error

attachment_upload_queue
  attachment_id
  local_file_uri
  checksum
  state
  uploaded_bytes
  attempt_count
```

Every outbound mutation has an idempotency key. Retrying the same mutation must not create duplicate rows or duplicate side effects.

### 15.5 Sync flow

1. Authenticate the registered device when online.
2. Push a bounded batch of queued mutations.
3. The server derives `vet_id` from the authenticated session.
4. The server validates ownership, schema, state transition, and `base_server_version`.
5. The server returns accepted versions or typed conflicts.
6. Pull server changes after the last checkpoint.
7. Apply changes transactionally to the local database.
8. Advance the checkpoint only after the transaction succeeds.
9. Upload attachments separately with resumable state.

Use bounded pages and backpressure. Do not perform unbounded full-table synchronization after initial setup.

### 15.6 Conflict strategy

Do not use universal field-level merge and do not silently use last-write-wins for medical prose.

| Record type                      | Conflict behavior                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| Completed visit                  | Immutable; reject edits and require amendment                                                      |
| Draft SOAP text                  | Section-level optimistic concurrency; manual comparison when both devices changed the same section |
| Exam finding                     | Per-system optimistic concurrency; manual conflict when the same system changed on two devices     |
| Client contact details           | Show a conflict comparison for competing identity/contact changes                                  |
| Record signing                   | Validate allowed state transition; reject stale transitions                                        |
| Reminder/payment side effects    | Idempotency key; never merge                                                                       |
| Non-critical display preferences | Last-write-wins is acceptable                                                                      |

A conflict screen must show:

- Local value.
- Server value.
- Last modified time and device.
- Safe actions: keep local, keep server, or manually combine.

Conflict resolution itself creates a new audited mutation.

### 15.7 Deletions

Use tombstones through `deleted_at`. Hard deletion before all registered devices have observed the tombstone can cause deleted records to reappear.

A background retention job may purge eligible tombstones only after the documented retention window and device checkpoint policy are satisfied.

### 15.8 Offline feature matrix

Must work fully offline:

- Unlock the app on a previously authenticated device.
- Search cached clients and patients.
- View cached histories and vaccination records.
- Create and edit clients and patients.
- Create and edit draft visits.
- Complete a visit locally and queue the signed transition.
- Record examinations, diagnostics, preventive care, and invoices.
- Capture photos and files for later upload.
- View cached folders and their recent consultation records.

Requires connectivity:

- Initial signup and device registration.
- Public passport rendering and token rotation.
- Sending WhatsApp messages.
- Subscription payment initiation and live reconciliation.
- Server-generated export packages.
- Cross-device synchronization.

---

## 16. Security Requirements

### 16.1 Authentication

- Email or phone-based authentication may be used, but account recovery must be verified before production.
- Multi-factor authentication should be available and required for high-risk actions when supported.
- Sessions must be revocable per device.
- Password reset and phone-change workflows must prevent account takeover.

### 16.2 Application security

Implement:

- Strict server-side validation.
- Safe output encoding for clinical notes.
- Content Security Policy on the web application.
- Secure HTTP headers.
- CSRF protection for cookie-authenticated state-changing web operations.
- Strict CORS allow lists for API endpoints.
- Rate limiting for authentication, passport, export, payment, and messaging endpoints.
- Webhook signature verification.
- File type, size, and content validation.
- Malware scanning when operationally feasible.
- Private storage buckets and storage RLS.
- Secret storage through platform environment controls.
- Secret rotation procedures.
- Dependency and container scanning in CI where applicable.

### 16.3 Sensitive-data handling

- Never log clinical note bodies by default.
- Never expose Supabase service-role credentials to web or mobile clients.
- Never send full clinical records through WhatsApp reminders.
- Do not collect more client data than the product needs.
- Encrypt data in transit and use platform-supported encryption at rest.
- Document Ghanaian and applicable regional privacy and veterinary record obligations before launch.

---

## 17. Privacy, Retention, Export, and Account Closure

Before production, define and publish:

- Privacy notice.
- Terms of service.
- Data-processing responsibilities.
- Owner communication and passport consent language.
- Clinical record retention period.
- Data correction and amendment process.
- Data export process.
- Account closure process.
- Breach-response process.
- Law-enforcement and regulatory request process.

### 17.1 Export

The veterinarian must be able to request an export containing:

- Clients.
- Patients and ownership history, individual and group.
- Consultation records and amendments.
- Examinations.
- Diagnostics.
- Vaccinations.
- Treatments, including withholding dates.
- Invoices and payments.
- Attachment manifest and downloadable files.

Generate exports asynchronously through a job table. Provide a short-lived signed download link. Audit creation and download.

### 17.2 Account closure

Account closure must:

1. Require recent authentication.
2. Explain retention obligations.
3. Offer data export first.
4. Disable new activity.
5. Revoke devices and public passports.
6. Retain or delete records according to the approved policy.
7. Record the closure in the audit log.

---

## 18. Observability and Operations

### 18.1 Logging

Use structured logs containing:

- Timestamp.
- Environment.
- Request or job ID.
- Tenant ID only when necessary and safely handled.
- Operation name.
- Outcome.
- Duration.
- Error class.

Redact:

- Tokens.
- Passwords and PINs.
- Authorization headers.
- Payment credentials.
- Clinical note contents.
- Full phone numbers where not required.

### 18.2 Monitoring

Monitor:

- Authentication failures.
- RLS-denied spikes.
- API error rate and latency.
- Sync failure rate and conflict rate.
- Reminder queue depth and failures.
- Payment webhook and reconciliation failures.
- Database connections, storage, slow queries, and table growth.
- Attachment upload failures.
- Public-passport abuse and rate-limit events.
- Mobile crash-free sessions.

### 18.3 Background jobs

Every scheduled or queued job must be:

- Idempotent.
- Retry-safe.
- Observable.
- Bounded in batch size.
- Protected against concurrent duplicate processing.
- Capable of recording a final failed state.

### 18.4 Backups and disaster recovery

Required before production:

- Automated database backups.
- Point-in-time recovery appropriate to the selected plan.
- Private-storage recovery strategy.
- Documented recovery point objective and recovery time objective.
- Quarterly restore test into an isolated environment.
- Recorded restore-test result and corrective actions.

A backup is not considered reliable until it has been restored successfully.

---

## 19. Performance and Scalability Guardrails

Design for growth without adding unnecessary infrastructure.

### 19.1 Database

- Every tenant query starts with `vet_id`.
- Index `vet_id` with common filters such as patient, date, status, and `updated_at`.
- Use cursor pagination, not large offsets, for high-volume histories and sync feeds.
- Avoid N+1 queries.
- Review query plans for search, patient history, synchronization, and passport rendering.
- Keep large files out of PostgreSQL.
- Use connection pooling suitable for serverless workloads.

### 19.2 Mobile

- Paginate local histories.
- Avoid loading all attachments into memory.
- Compress images before upload while preserving clinical usefulness.
- Use thumbnails for lists.
- Limit sync batches and retry with backoff.
- Keep the application usable on mid-range Android devices.

### 19.3 Public passport

- Cache only the allow-listed public DTO.
- Use short cache windows or active invalidation for revocation-sensitive data.
- Apply rate limits per IP and token.
- Do not perform expensive joins repeatedly without indexes or a controlled projection.

---

## 20. Design System and User Experience

Reference: `vetkeep-ui-demo.html`, supplied separately. The final product should preserve its visual identity while meeting accessibility and mobile-performance requirements.

### 20.1 Palette

- `#0B0E0D` — obsidian base.
- `#141915` — card base.
- `#2FE6C4` — electric teal primary accent, used sparingly.
- `#EDEFEC` — bone white primary text.
- `#7C8F87` — sage secondary text.
- `#F2A93B` — amber for abnormal findings and alerts only.

### 20.2 Typography

- Display and headers: Sora, weight 600–700.
- Body: IBM Plex Sans.
- IDs, vitals, timestamps, and precise data: IBM Plex Mono.

### 20.3 Signature visual

Use one animated ECG or pulse-line SVG on the dashboard's initial load. Elsewhere it may appear only as a static divider.

Respect reduced-motion preferences. Do not replay decorative animation repeatedly during routine clinical work.

### 20.4 Core interaction patterns

- SOAP documentation uses four clear sections: Subjective, Objective, Assessment, and Plan.
- Mobile navigation must preserve unsaved draft state when switching SOAP sections.
- The 11-system examination remains visible as a structured checklist.
- `not_examined`, `normal`, `abnormal`, and `not_applicable` must be visually distinct.
- Abnormal findings use amber and text/icon cues, not color alone.
- Scheduling uses request-then-confirm workflows.
- Health passport uses an accessible summary/vaccination/history presentation. A carousel may be used only when keyboard, screen-reader, and reduced-motion behavior are correct.
- Every destructive or record-locking action clearly explains its effect.

### 20.5 Glass effects

Glass-morphism may be used for visual identity, but heavy blur is not mandatory on every card.

- Provide a solid-background fallback.
- Reduce blur on low-power devices.
- Maintain sufficient contrast.
- Do not allow visual styling to reduce scrolling, input, or rendering performance.

### 20.6 Accessibility

- Visible keyboard focus states.
- Screen-reader labels.
- Minimum touch target sizes.
- Error text associated with fields.
- Contrast-compliant text and controls.
- Reduced-motion support.
- No status communicated by color alone.

---

## 21. Explicitly Out of Scope for v1

- Clinic, branch, hospital, or organization accounts.
- Additional veterinarian, nurse, receptionist, or assistant logins.
- Shared record ownership or inter-clinic transfer workflows.
- Client login, portal, or client mobile application.
- Appointment booking, diaries, and route planning. Work is arranged by telephone and email, outside the product — see §11.
- Production-management records: breeding cycles, feed conversion, growth curves, yield tracking, and profitability. Group **clinical** records and group treatment are in scope — see §6.2, §7.9, and §7.10.
- Pharmacy-grade or multi-location inventory systems. Personal field-supply tracking for a single vet's own carried stock, extended with formulary and withdrawal data, is in scope — see §7.8 and §7.10.
- Procurement and supplier management.
- Insurance claims.
- Payroll and staff scheduling.
- AI scribe or transcription.
- Automated diagnosis or treatment recommendations.
- Client payment processing through VetKeep.
- Financing or loan products.
- Real-time GPS tracking of the veterinarian.
- Paid route-optimization APIs unless later justified.

---

## 22. Testing Strategy

### 22.1 Unit tests

Cover:

- Domain state transitions.
- Code generation.
- Invoice calculations.
- Subscription entitlements.
- Passport field allow lists.
- Sync conflict classification.
- Validation schemas.

### 22.2 Database tests

Cover:

- RLS isolation.
- Parent-child `vet_id` consistency.
- Completed-visit immutability.
- Amendment creation.
- Unique constraints.
- Status checks.
- Tombstone behavior.
- Idempotency constraints.
- Audit trigger behavior.

### 22.3 Integration tests

Cover:

- Authentication and device registration.
- Sync push and pull.
- Attachment upload and signed access.
- WhatsApp reminder creation and callbacks.
- Hubtel initiation, callbacks, duplicates, failures, and reconciliation.
- Public passport privacy boundary.
- Export generation.

### 22.4 End-to-end tests

Critical journeys:

1. Sign up, start trial, and register a mobile device.
2. Create an owner and patient offline.
3. Record and complete a consultation offline.
4. Reconnect and synchronize without duplication.
5. Open the same account on a second device and receive the record.
6. Create a conflicting draft edit and resolve it.
7. Add a vaccination and enable a consented passport.
8. Sign a consultation record, hand the client a copy, and send a follow-up reminder.
9. Create and mark a client invoice partially paid.
10. Enter past-due mode without losing existing records.

### 22.5 Security tests

- Cross-tenant ID enumeration.
- Anonymous access to private tables and storage.
- Broken-object-level authorization.
- Rate-limit bypass.
- Webhook forgery and replay.
- Malicious file upload.
- XSS in clinical notes and public passport fields.
- Session theft and revoked-device behavior.
- Export authorization.

---

## 23. CI/CD and Environments

Maintain separate:

- Local development.
- Shared test or preview.
- Staging.
- Production.

Requirements:

- Database migrations are version-controlled.
- Production schema changes are forward-safe and reviewed.
- CI runs formatting, linting, type checking, unit tests, database tests, and build verification.
- Preview environments never use production secrets or production clinical data.
- Production deployment requires migration checks and a rollback plan.
- Mobile releases use staged rollout and crash monitoring.
- Feature flags protect high-risk integration changes.

Do not manually edit the production schema outside the migration process except during a documented incident.

---

## 24. Implementation Phases

### Phase 0 — Mandatory architecture validation

1. Confirm Hubtel's supported subscription-renewal mechanism.
2. Complete the RxDB versus WatermelonDB proof of concept.
3. Confirm React Native local database encryption and secure-device support.
4. Validate two-device sync and clinical conflict handling.
5. Confirm public-passport consent and privacy wording.
6. Confirm record-retention and veterinary documentation obligations.
7. Finalize v1 status enums and state-transition diagrams.

**Exit gate:** all decisions are recorded in architecture decision records and the offline proof of concept passes.

### Phase 1 — Platform foundation

1. Monorepo and environment setup.
2. Supabase migrations and generated types.
3. Authentication and veterinarian onboarding.
4. Device registry and secure local unlock.
5. RLS baseline and cross-tenant tests.
6. Audit log.
7. Observability baseline.
8. Backup and restore procedure.
9. CI/CD pipelines.

### Phase 2 — Core practice workflow (first vertical slice)

Reprioritized 2 August 2026. Phase 2 now delivers one complete, working workflow end to end rather than clinical records in isolation. It pulls forward the minimum needed from the original Phases 3, 4, and 6 to make that workflow real, and adds field inventory (§7.8), which was not previously scoped.

1. **Veterinarian workspace.** Professional profile, licence verification, service areas, working hours, services offered, pricing and call-out fees (builds on the Phase 1 account/device model).
2. **Clients and patients.** Owner contact and address, multiple pets per owner, signalment and identification, vaccination/deworming history, allergies and chronic-condition alerts, normalized search (§6).
3. **The folder.** A patient folder that is either an individual or a group; standing information editable for the life of the folder; an append-only series of dated consultation records beneath it; `VK-R-` record codes (§6, §7).
4. **Mobile medical records.** Presenting complaint and history, exam vitals and the examination set for the species, problem list and differentials, diagnostics and attachments, assessment and treatment, prescriptions, procedures, discharge/home-care instructions, follow-up intent, record signing, locking, and amendments (§7).
5. **Species pathways.** Companion, pet bird, food animal, and group, each with its own objective findings and examination set (§7.9).
6. **Treatments, formulary, and withdrawal.** Structured treatment rows linked to the drug list; dose calculated from rate, weight and strength with the working shown; withdrawal periods on `inventory_items`; computed and displayed milk, meat, and egg withholding dates for every food-producing folder (§7.10).
7. **Payments and records — basic slice.** Service, medication, and call-out charges; cash/mobile-money/card status; receipts; outstanding balances; simple income/expense summary (§14, basic path only — VetKeep's own subscription billing stays in Phase 6).
8. **The drug list.** What each product contains, its usual route, its strength, and the withholding it imposes — maintained on the web application and read on mobile. No quantities, batches, expiry, or low-stock warnings; see §7.8 for why stock counting was built and then removed.
9. **The client's copy.** On-device generation of a signed consultation record, shareable and saveable, with active withholding shown; disclosure audited (§10.6).
10. **Communication and follow-up — basic slice.** Vaccination and follow-up reminders, withdrawal-end reminders, WhatsApp-friendly delivery, communication history (§12, basic path only — delivery-state/callback maturity stays in Phase 4).
11. **Offline resilience — basic slice.** Draft consultations offline, safe local storage, sync on reconnect, conflict prevention, visible sync status, retry without duplicates (§15, basic path only — full local schema, resumable uploads at scale, and schema-migration-with-unsynced-data testing stay in Phase 3).

**Exit gate — first complete vertical slice:** create a client and a folder for one dog and one poultry flock; attend and document a consultation on each on mobile, offline, using the examination set the species calls for; administer a product from the drug list, let the dose be calculated from rate and weight, and see the withholding dates computed for the flock; sign both records; hand the client a copy; record payment; and set a follow-up — end to end, before broadening to any other module.

### Phase 3 — Offline mobile hardening

Builds on the basic offline resilience shipped in Phase 2.

1. Full local schema covering every Phase 2 entity, including inventory.
2. Push and pull synchronization at scale.
3. Mutation idempotency under retry.
4. Tombstones and purge policy.
5. Conflict screen for all record types in §15.6, not just drafts.
6. Resumable attachment uploads under real network interruption.
7. Schema migrations with unsynced data present.
8. Device revocation and recovery testing.

### Phase 4 — Communication hardening

Builds on the basic communication shipped in Phase 2. Route optimization is no longer part of this phase; see §11.

1. Full-history export for folder transfer to another veterinarian.
2. Reminder outbox maturity: exponential retry, dead-letter visibility.
3. WhatsApp provider integration hardening and callback verification.
4. Delivery-state handling (sent/delivered/read) and template-version tracking.

### Phase 5 — Health passport

1. Consent workflow.
2. Public token generation and hashing.
3. Allow-listed public DTO.
4. Rate limiting and access logging.
5. QR generation and revocation.
6. Privacy and accessibility testing.

### Phase 6 — Commercial workflows (VetKeep subscription billing)

Client invoicing itself ships in Phase 2; this phase covers VetKeep's own subscription commerce only.

1. Trial and entitlement logic.
2. Hubtel payment initiation.
3. Signed webhook processing.
4. Reconciliation and grace period.
5. Past-due continuity behavior.

### Phase 7 — Production hardening

1. Load and performance testing.
2. Security assessment.
3. Restore drill.
4. Incident-response runbook.
5. Mobile staged release.
6. Pilot with a small group of solo veterinarians.
7. Resolve pilot defects before general release.

---

## 25. Production Release Gates

VetKeep must not enter general production until all of the following are proven:

### Tenant isolation

- Vet A cannot read, write, count, infer, download, or search Vet B's data.
- Anonymous users cannot query private medical tables or storage.

### Clinical integrity

- Examination systems default to `not_examined`.
- A completed visit cannot be silently edited.
- Corrections appear as signed amendments.
- A completed record cannot be hard-deleted by the veterinarian.

### Offline reliability

- Offline-created records survive application restart and device reboot.
- Retried mutations do not create duplicates.
- Deleted records do not reappear from an old device.
- Conflicting clinical text is not silently merged.
- Attachment uploads resume after interruption.
- Local schema upgrades preserve unsynced data.

### Security

- Revoked devices lose future access after reconnecting.
- Local records are protected by secure unlock and encrypted storage.
- Public passport tokens cannot be guessed.
- Webhook replay and forgery tests fail safely.

### Billing and continuity

- Duplicate Hubtel callbacks do not create duplicate payments.
- Subscription status is reconciled against provider state.
- A disconnected device is never locked merely because it cannot refresh entitlement.
- Queued clinical work is not discarded when an account becomes past due.

### Operations

- Monitoring and alerting are active.
- Failed jobs are visible and recoverable.
- A production-like backup has been restored successfully.
- Incident, export, and account-closure procedures have been exercised.

---

## 26. Definition of Done for Every Feature

A feature is not complete until it includes:

- Product acceptance criteria.
- Mobile and web behavior where applicable.
- Offline behavior and sync behavior.
- Server-side validation.
- Database constraints.
- RLS policies and isolation tests.
- Audit requirements.
- Loading, empty, error, and retry states.
- Accessibility checks.
- Structured logs and relevant monitoring.
- Unit and integration tests.
- Migration and rollback considerations.
- Updated technical documentation.

---

## 27. Final Engineering Direction

The product experience should remain intentionally simple: one veterinarian, one private workspace, fast clinical documentation, dependable offline use, controlled owner communication, and no clinic-management complexity.

The implementation beneath that experience must be rigorous. Medical records require stronger guarantees than ordinary CRUD software. VetKeep therefore treats tenant isolation, signed-record immutability, append-only amendments, offline conflict safety, idempotent integrations, secure device storage, and tested recovery as core product capabilities rather than later enterprise add-ons.

This architecture preserves the original VetKeep vision while providing a maintainable path from pilot release to a reliable regional veterinary platform.
