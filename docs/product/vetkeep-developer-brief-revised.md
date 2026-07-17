# VetKeep — Revised Developer Build Brief

**Document status:** Technical build specification  
**Product stage:** Pre-development architecture baseline  
**Revision date:** 11 July 2026  
**Primary market:** Independent solo veterinarians in Ghana and West Africa  
**Primary platforms:** Mobile application for clinical work; web application for account, public passport, and platform workflows

---

## 1. Product Vision

VetKeep is a subscription-based clinical record-keeping platform built **exclusively for independent, solo veterinarians**, especially veterinarians who provide home-call, mobile, ambulatory, and field services.

The product is not a clinic-management system. It must remain faster, simpler, and more practical than systems designed for hospitals, chains, or multi-user clinics.

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

1. Find a client or patient quickly.
2. Review the animal's relevant history.
3. Document a complete consultation offline.
4. Capture diagnostic files and photographs offline.
5. Record vaccinations and due dates.
6. Schedule and confirm follow-up visits.
7. Send reminders through WhatsApp when connected.
8. Produce a controlled public health passport.
9. Create a professional invoice without VetKeep handling the client's payment.
10. Trust that completed medical records cannot be silently altered or lost.

### 1.2 Non-negotiable product boundaries

VetKeep v1 is:

- Solo-veterinarian only.
- Single-seat per veterinarian account.
- Mobile-first and offline-first.
- Focused on clinical records, scheduling, reminders, passports, and simple invoicing.
- Suitable for individually identifiable companion animals and livestock.

VetKeep v1 is not:

- A clinic, hospital, or branch-management platform.
- A multi-vet collaboration product.
- A client portal or client mobile app.
- An inventory, pharmacy, payroll, or insurance system.
- A herd/flock production-management system.

Group, herd, flock, pen, and production-unit records may be introduced later. In v1, each patient record represents one identifiable animal.

---

## 2. Product and Tenancy Model

VetKeep has one authenticated veterinarian per account and no staff seats. This remains a deliberately simple product experience.

From a security and data-isolation perspective, VetKeep is still a **single-seat multi-tenant SaaS platform**:

- One tenant equals one veterinarian account.
- Each tenant has one authenticated veterinarian user.
- There are no clinic organizations, staff roles, or shared records in v1.
- Every private record is owned by exactly one `vet_id`.

This distinction must be preserved in the implementation because cross-account data exposure is a critical security risk even when every account has only one user.

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

```sql
create table patients (
  id uuid primary key,
  vet_id uuid not null references vets(id) on delete restrict,
  patient_code text not null,
  name text not null,
  species text not null,
  breed text,
  sex text not null
    check (sex in ('male', 'female', 'male_neutered', 'female_spayed', 'unknown')),
  date_of_birth date,
  date_of_birth_precision text not null default 'exact'
    check (date_of_birth_precision in ('exact', 'estimated', 'unknown')),
  color_markings text,
  microchip_id text,
  identification_notes text,
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
  unique (vet_id, patient_code)
);
```

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

## 7. Visits and Clinical Records

### 7.1 Visit lifecycle

A visit has the following states:

```text
draft -> completed
completed -> amended through a separate amendment record
any state -> voided with a mandatory reason
```

A completed visit is a signed medical record. It cannot be directly edited or deleted by ordinary application operations.

### 7.2 Visits table

```sql
create table visits (
  id uuid primary key,
  vet_id uuid not null references vets(id) on delete restrict,
  patient_id uuid not null references patients(id) on delete restrict,
  appointment_id uuid,
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

Create the following 11 rows when a visit is created:

- General.
- Cardiovascular.
- Respiratory.
- Gastrointestinal.
- Musculoskeletal.
- Integumentary.
- Neurological.
- Ocular.
- Aural.
- Urogenital.
- Lymphatic.

All rows start as `not_examined`.

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

### 7.7 Vaccinations

```sql
create table vaccinations (
  id uuid primary key,
  vet_id uuid not null references vets(id) on delete restrict,
  patient_id uuid not null references patients(id) on delete restrict,
  visit_id uuid references visits(id) on delete restrict,
  vaccine_name text not null,
  manufacturer text,
  batch_lot_number text,
  expiry_date date,
  dose text,
  route text,
  administration_site text,
  date_given date not null,
  next_due_date date,
  certificate_number text,
  adverse_reaction text,
  administered_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1,
  created_by_device_id uuid,
  last_modified_by_device_id uuid,
  check (next_due_date is null or next_due_date >= date_given)
);
```

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
- Completed visits, vaccinations, invoices, payment records, and audit events cannot be hard-deleted through the tenant application.
- An erroneous completed visit is voided with a reason; it is not erased.
- Account closure follows the documented retention and export policy.

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

Database triggers or controlled functions must reject a child record whose `vet_id` differs from its parent visit, patient, appointment, diagnostic, or invoice.

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

Anonymous users must not receive direct `SELECT` access to `patients`, `clients`, `visits`, `vaccinations`, or `attachments`.

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

---

## 11. Scheduling and Route Planning

### 11.1 Appointment workflow

VetKeep uses request-then-confirm scheduling. There is no public open-booking calendar in v1.

```text
requested -> confirmed
requested -> declined
confirmed -> rescheduled
confirmed -> completed
confirmed -> cancelled
confirmed -> no_show
```

```sql
create table appointments (
  id uuid primary key,
  vet_id uuid not null references vets(id) on delete restrict,
  patient_id uuid references patients(id) on delete restrict,
  client_id uuid references clients(id) on delete restrict,
  appointment_type text not null
    check (appointment_type in ('home_call', 'clinic_visit', 'field_visit', 'emergency', 'follow_up')),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  status text not null default 'requested'
    check (status in ('requested', 'confirmed', 'declined', 'rescheduled', 'completed', 'cancelled', 'no_show')),
  decline_reason text,
  cancellation_reason text,
  visit_address text,
  visit_latitude numeric(9,6),
  visit_longitude numeric(9,6),
  travel_notes text,
  reason_for_visit text,
  visit_id uuid references visits(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default 1,
  created_by_device_id uuid,
  last_modified_by_device_id uuid,
  check (
    scheduled_start is null
    or scheduled_end is null
    or scheduled_end > scheduled_start
  )
);
```

An emergency request may be created without a confirmed time, but it must still record status and contact information.

### 11.2 Routes

Do not store appointment IDs in an array.

```sql
create table daily_routes (
  id uuid primary key,
  vet_id uuid not null references vets(id) on delete restrict,
  route_date date not null,
  optimized boolean not null default false,
  optimization_method text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vet_id, route_date)
);

create table daily_route_stops (
  id uuid primary key,
  vet_id uuid not null references vets(id) on delete restrict,
  route_id uuid not null references daily_routes(id) on delete cascade,
  appointment_id uuid not null references appointments(id) on delete cascade,
  sequence_number integer not null check (sequence_number > 0),
  estimated_arrival timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (route_id, appointment_id),
  unique (route_id, sequence_number)
);
```

At launch, use a simple nearest-neighbor ordering when valid coordinates exist. The veterinarian must be able to reorder stops manually.

Do not integrate a paid routing API before usage proves the need. Preserve an interface boundary so a routing provider can be added later without changing appointment storage.

---

## 12. WhatsApp Reminders and Messaging Outbox

Do not use a single `sent boolean`.

### 12.1 Reminder definitions

```sql
create table appointment_reminders (
  id uuid primary key,
  vet_id uuid not null references vets(id) on delete restrict,
  appointment_id uuid not null references appointments(id) on delete cascade,
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
  updated_at timestamptz not null default now()
);
```

### 12.2 Outbox pattern

Appointment confirmation and reminder creation must be committed in the same database transaction.

A scheduled worker claims due reminders with row locking, sends through the configured provider, and updates status idempotently.

Requirements:

- Exponential retry with a maximum attempt count.
- Dead-letter visibility for permanently failed messages.
- Provider callback verification.
- Duplicate callback handling.
- Message-template version tracking.
- Communication consent enforcement.
- No clinical details in reminders beyond the minimum necessary appointment description.

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
  status text not null default 'unpaid'
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
| Appointment status               | Validate allowed state transition; reject stale transitions                                        |
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
- Record examinations, diagnostics, vaccinations, and invoices.
- Capture photos and files for later upload.
- View cached appointments and route stops.

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
- Patients and ownership history.
- Visits and amendments.
- Examinations.
- Diagnostics.
- Vaccinations.
- Appointments.
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
- Herd, flock, group-treatment, or production-management records.
- Inventory and pharmacy stock control.
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
8. Confirm an appointment and send a reminder.
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

### Phase 2 — Core client and clinical records

1. Clients and normalized search.
2. Patients and ownership history.
3. Visit drafts and SOAP sections.
4. Physical examination checklist with `not_examined` default.
5. Diagnostics.
6. Vaccinations.
7. Attachments.
8. Visit completion, locking, voiding, and amendments.

### Phase 3 — Offline mobile completion

1. Full local schema.
2. Push and pull synchronization.
3. Mutation idempotency.
4. Tombstones.
5. Conflict screen.
6. Resumable attachment uploads.
7. Schema migrations with unsynced data.
8. Device revocation and recovery testing.

### Phase 4 — Scheduling and communication

1. Appointment workflow.
2. Route stops and manual ordering.
3. Reminder outbox.
4. WhatsApp provider integration.
5. Callback and delivery-state handling.

### Phase 5 — Health passport

1. Consent workflow.
2. Public token generation and hashing.
3. Allow-listed public DTO.
4. Rate limiting and access logging.
5. QR generation and revocation.
6. Privacy and accessibility testing.

### Phase 6 — Commercial workflows

1. Trial and entitlement logic.
2. Hubtel payment initiation.
3. Signed webhook processing.
4. Reconciliation and grace period.
5. Past-due continuity behavior.
6. Client invoices, items, and payments.

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
