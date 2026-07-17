# Phase 1 test remediation

## Why this remediation was required

The first delivery allowed the web and mobile test commands to succeed when no test files existed. It also did not verify that generated Supabase types matched the application call sites. Those gaps made the earlier completion claim unreliable.

## Controls added

- Removed `--passWithNoTests` from both application test commands.
- Added real web tests for environment validation and onboarding RPC argument construction.
- Added real mobile tests for environment validation, onboarding RPC argument construction, and secure-store chunking/reassembly.
- Removed meaningless test scripts from type-only packages.
- Added a CI database-types drift check after local migrations and pgTAP tests.
- Corrected pgTAP exception assertions to validate SQLSTATE, message, and description.
- Updated RPC call sites to omit absent optional parameters, which is required with `exactOptionalPropertyTypes`.

## Verified results

- Formatting: passed.
- ESLint: passed.
- Uncached TypeScript checks: 7/7 workspaces passed.
- Runtime unit tests: 18/18 tests passed across domain, observability, validation, web, and mobile.
- Web test files: 2 passed, 4 tests.
- Mobile test files: 3 passed, 7 tests.
- Next.js production build: passed.
- Expo Android export: passed.
- Dependency audit: 0 high-or-greater vulnerabilities.
- Database security tests: 22/22 passed on the user's local Supabase stack.

## Remaining acceptance gate

Run the local browser smoke test for signup, confirmation, MFA enrollment/challenge, onboarding, dashboard access, and sign-out. Phase 1 should not be considered accepted until that flow passes.
