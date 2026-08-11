# Phase 1 acceptance status

> **This document has two parts.** The acceptance record below is dated and is
> left as it was written: it is the evidence on which Phase 1 was accepted on 2
> August 2026, and rewriting it would destroy the only account of what was
> actually checked that day. Everything built since is described under
> [Current state](#current-state--11-august-2026), which is where a reader
> wanting to know how things stand today should go.

## Implemented

- npm-workspace monorepo for Next.js web, Expo mobile, shared domain, validation, database types, contracts, and observability.
- Local, staging, and production environment separation guidance.
- Supabase Auth integration with mandatory TOTP MFA before private tenant data is readable.
- Single-seat tenant isolation through PostgreSQL RLS.
- Controlled SECURITY DEFINER RPCs for onboarding, profile changes, device registration, device heartbeat, and revocation.
- Append-only audit trail with restricted metadata size.
- Active-account mutation enforcement while preserving read access and security containment operations.
- Normalized uniqueness for verified Veterinary Council licence numbers.
- Local-only ordinary sign-out and conservative remote-session containment during device revocation.
- Fifteen-minute access-token lifetime in local Supabase configuration.
- Mobile secure session storage and biometric relocking shell.
- Redacting structured logging utilities.
- CSP, production HSTS, no-store headers on authenticated pages, and secret scanning.
- GitHub Actions for quality, database security, database-type drift, CodeQL, dependency audit, and gitleaks.
- Backup, restoration, incident-response, branch-protection, and environment runbooks.

## Verified

- Public npm registry clean install: passed.
- Prettier formatting: passed.
- ESLint: passed.
- Uncached TypeScript checks across seven workspaces: 7/7 passed.
- Runtime unit tests: 18/18 passed.
  - Web: 2 test files, 4 tests.
  - Mobile: 3 test files, 7 tests.
  - Shared packages: 7 tests.
- Next.js production build: passed.
- Expo Android export: passed.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- Local Supabase start and migration application: passed on the Windows development machine.
- pgTAP database/RLS suite: 22/22 passed on the Windows development machine.
- Generated database types compile against both web and mobile RPC call sites.
- Local browser smoke test (2 August 2026): passed without console errors or database-policy failures —
  1. Account signup.
  2. Local confirmation email.
  3. Email confirmation callback.
  4. MFA enrollment.
  5. MFA challenge after sign-in.
  6. Veterinarian onboarding.
  7. Dashboard access.
  8. Sign-out and sign-in again.

## Intentional boundaries

These were the boundaries **of Phase 1**. Several have since been crossed
deliberately as later phases landed; see [Current state](#current-state--11-august-2026).

- No clinical records.
- No offline clinical database.
- No public health passport.
- No payments or WhatsApp integrations.
- No AI processing.
- No support console or staff access.
- Licence verification remains an operations-controlled action and cannot be self-approved by a veterinarian account.

## Phase 1 exit decision

The code, database security suite, generated types, unit tests, builds, dependency audit, and the local browser smoke test all pass. **Phase 1 is accepted as of 2 August 2026.** Phase 2 scope is defined in `docs/product/vetkeep-developer-brief-revised.md`.

---

# Current state — 11 August 2026

## What the product now is

A **record-keeping** application for a solo veterinarian on house and farm
calls. Each animal or group is a **folder**: standing information that stays
editable, and an append-only series of dated consultation records beneath it.
Scheduling was specified, built, and removed — work arrives by telephone, not
through the application.

The full specification is `docs/product/vetkeep-developer-brief-revised.md`,
which carries its own dated revision notes.

## Built since Phase 1

| Area                                                                      | State       |
| ------------------------------------------------------------------------- | ----------- |
| Folder model — individuals and groups (flock, herd, pen)                  | Built       |
| SOAP consultation records, sign, void with reason, amendments             | Built       |
| Species-derived examination sets — mammal, rabbit, pet bird, group        | Built       |
| Treatments with computed meat/milk/egg withholding                        | Built       |
| Dose calculation from rate × weight ÷ strength, working shown             | Built       |
| Drug list — active ingredient, route, strength, withholding periods       | Built       |
| Preventive care — vaccination and deworming with due dates                | Built       |
| Clinical attachments and resumable upload                                 | Built       |
| Animal photograph on the folder                                           | Built       |
| Client's copy — one record or full history, generated on device, audited  | Built       |
| Device-local drafts that survive navigation, separate from the sync queue | Built       |
| Offline sync with conflict resolution                                     | Built       |
| Invoicing — basic slice                                                   | Built       |
| Public health passport                                                    | Not started |
| WhatsApp reminders and outbox                                             | Not started |
| Subscription billing                                                      | Not started |

## Boundaries that moved, and why

- **"No clinical records"** and **"no offline clinical database"** were Phase 1
  boundaries. Both are now the centre of the product.
- **Groups are in scope.** The v1 exclusion was reversed on 10 August: a flock
  is the patient, and the questions asked of it differ from those asked of one
  animal.
- **Scheduling is out of scope**, and as of 11 August out of the schema too —
  five tables and eighteen RPCs dropped.
- **Stock counting is out of scope.** It was built, then removed: nobody counts
  what is in the boot of their car, and a low-stock warning drawn from an
  unmaintained quantity is not useless but wrong. The drug list survives; it
  records what a product _obliges_, not how much is left.

## Verified — 11 August 2026

| Check                          | Result                                   |
| ------------------------------ | ---------------------------------------- |
| pgTAP database/RLS suite       | **387 assertions, 12 files, 0 failures** |
| Domain unit tests              | 91                                       |
| Mobile unit tests              | 78                                       |
| Sync unit tests                | 68                                       |
| Web unit tests                 | 7                                        |
| Validation / observability     | 3 / 1                                    |
| TypeScript across 8 workspaces | 8/8 passed                               |
| ESLint                         | passed                                   |
| Prettier                       | passed                                   |
| Next.js production build       | passed, 17 routes                        |

pgTAP fell from 555 assertions to 387 on 11 August. The 168 that went tested
scheduling and field inventory; both files were deleted because the code they
covered no longer exists. A suite that shrinks because its subject was removed
is not a regression, but it should never shrink silently.

## Known issues

- **`npm audit --audit-level=high` reports 14 high-severity advisories**, against
  0 at Phase 1 acceptance. All fourteen resolve to one root cause: a
  denial-of-service in the ICNS parser of `image-size`, reached through Expo's
  Metro toolchain. It is a **build-time** dependency of the bundler and is not
  shipped in the application binary. The remedy npm proposes is `expo@53`, which
  is a downgrade from the installed SDK 57 and would undo the native version
  alignment in `7bf971f`, so it has not been applied. This needs an upstream
  Expo release, not a local fix.
- **`VK-R-` record codes are not implemented.** A shared document is currently
  identified by the patient code and the record date. The reasoning for a
  dedicated code stands.
- **No hosted staging.** The mobile application points at a Supabase instance on
  the development laptop, whose address changes with the network. Every change
  requires editing two `.env.local` files and restarting Metro.
- **`supabase db reset` destroys the local account and all local data.** It is
  run routinely while developing migrations. Local data is test data, but the
  account has to be created again afterwards, in the application.

## Development machine

Firewall rules `Metro dev 8081` and `Supabase local dev 54321`, and the Private
network profile that lets them apply, expose this laptop's local database to the
network it is attached to. They exist for on-device testing and **should be
removed when that testing ends.**
