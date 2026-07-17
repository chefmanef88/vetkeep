# Phase 1 threat model

| Threat                                               | Primary controls                                                                                                  | Verification                    |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Vet A reads Vet B data                               | Immutable tenant ownership, RLS, controlled RPCs                                                                  | pgTAP cross-tenant tests        |
| User self-verifies licence                           | No direct profile updates; RPC excludes verification fields                                                       | Permission test                 |
| Duplicate verified licence                           | Normalized partial unique index for verified licences                                                             | Database constraint test        |
| Suspended account continues mutating data            | Active-account guard in mutation RPCs                                                                             | Suspended-account pgTAP test    |
| Device ID is reassigned across tenants               | RPC binds device to current tenant and rejects conflicting/revoked IDs                                            | Cross-tenant RPC test           |
| Lost device retains refresh access                   | AAL2 security dashboard, sign out all other refresh-token sessions, revoked device registry, 15-minute JWT expiry | Staging integration test        |
| Ordinary sign-out unexpectedly logs out every device | Explicit `local` sign-out scope                                                                                   | Web/mobile review               |
| Audit trail is altered or abused                     | Append-only trigger, no client mutation grants, 8 KiB metadata limit                                              | Mutation and size tests         |
| Mobile token theft                                   | OS secure storage, this-device-only accessibility, biometric/passcode relock                                      | Physical-device review          |
| Clinical information leaks to logs                   | Central redaction utility and identifier-only events                                                              | Unit tests and log review       |
| Secret key enters client bundle                      | Environment naming, CI secret scan, no server secrets in app packages                                             | Bundle review and gitleaks      |
| Authenticated pages are cached or indexed            | `no-store`, `noindex`, CSP, HSTS, frame denial                                                                    | Header integration test         |
| Session cookie becomes stale                         | Next.js proxy refresh plus server-side `getUser()` checks                                                         | Integration test in staging     |
| Automated signup abuse                               | Provider rate limits, verified email, CAPTCHA before public signup                                                | Production configuration review |

## Residual risks

- A revoked Supabase access token remains valid until its short expiry; individual access-token revocation is not available.
- A compromised, already-unlocked phone can expose information currently visible in memory until the application relocks.
- Device registration is not hardware attestation.
- Phase 1 stores no offline clinical database. Phase 3 must add encrypted clinical storage, active-device sync credentials, online revocation checks, offline-expiry enforcement, and cryptographic erasure before real clinical records are cached.
