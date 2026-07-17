# VetKeep Phase 1 — Secure Platform Foundation

This repository implements VetKeep's Phase 1 foundation while deliberately excluding clinical records:

- TypeScript monorepo with Next.js web, Expo mobile, and shared packages.
- Supabase migrations, Row Level Security, controlled RPCs, and append-only audit events.
- Mandatory TOTP MFA before private tenant data is readable.
- Veterinarian onboarding, licence-verification state, and registered-device management.
- Local-only ordinary sign-out and conservative lost-device session containment.
- Secure mobile session storage and biometric/passcode relocking.
- Redacting observability utilities and hardened authenticated-page headers.
- Database isolation tests, CodeQL, secret scanning, dependency audit, and CI pipelines.
- Backup, restore, incident, environment, and device-revocation runbooks.

No production or real clinical data belongs in development or staging.

See [PHASE1_STATUS.md](./PHASE1_STATUS.md) for verified checks, remaining CI gates, and intentional boundaries.

## Prerequisites

- Node.js 22 or 24 LTS
- npm 10
- Docker Desktop for local Supabase
- Supabase CLI, installed as a development dependency

## Install

```bash
npm ci
```

## Local database

```bash
npm run db:start
npm run db:reset
npm run db:test
npm run db:types
```

Copy the local Supabase values printed by `npm run db:start` into:

- `apps/web/.env.local`, based on `apps/web/.env.example`
- `apps/mobile/.env.local`, based on `apps/mobile/.env.example`

Use the publishable key in user-facing apps. Never place a Supabase secret or service-role key in browser or mobile variables.

## Run

```bash
npm run dev --workspace=@vetkeep/web
npm run dev --workspace=@vetkeep/mobile
```

## Verify

```bash
scripts/verify-phase1.sh
```

## Phase 1 boundaries

This phase intentionally does not implement clinical records or offline clinical storage. It establishes authentication, onboarding, device containment, tenant isolation, auditing, secure session handling, environment separation, and delivery controls required before Phase 2.
