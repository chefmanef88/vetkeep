# Phase 1 acceptance status

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

## Remaining acceptance gate

The local browser smoke test still needs to pass for:

1. Account signup.
2. Local confirmation email.
3. Email confirmation callback.
4. MFA enrollment.
5. MFA challenge after sign-in.
6. Veterinarian onboarding.
7. Dashboard access.
8. Sign-out and sign-in again.

Phase 1 should be considered accepted only after this flow passes without console errors or database-policy failures.

## Intentional boundaries

- No clinical records.
- No offline clinical database.
- No public health passport.
- No payments or WhatsApp integrations.
- No AI processing.
- No support console or staff access.
- Licence verification remains an operations-controlled action and cannot be self-approved by a veterinarian account.

## Phase 1 exit decision

The code, database security suite, generated types, unit tests, builds, and dependency audit now pass. Complete the local browser smoke test before pushing to GitHub or starting Phase 2.
