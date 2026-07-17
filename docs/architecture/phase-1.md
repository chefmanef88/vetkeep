# Phase 1 architecture

## Trust boundaries

1. **Mobile device:** Untrusted network; protected session tokens stored through OS secure storage. No secret/service key.
2. **Web browser:** Untrusted client; publishable Supabase key only. Server pages repeat authorization checks.
3. **Supabase Auth:** Establishes identity; it does not by itself establish tenant authorization.
4. **PostgreSQL:** Final authorization boundary through RLS, revoked table mutations, controlled RPCs, and constraints.
5. **Internal operations:** No support console or automatic tenant-data access in Phase 1.

## Tenant model

One tenant equals one veterinarian profile. Every private record added in later phases will carry an immutable `vet_id`. The authenticated user's tenant is resolved from `auth.uid()` through the `vets.auth_user_id` relationship.

## Authentication assurance

TOTP MFA is mandatory. Private RLS policies and sensitive database RPCs require an `aal2` JWT, so an AAL1 password-only session cannot read tenant foundation data or register devices.

## Mutation model

User-facing applications do not directly insert or update the foundation tables. Controlled RPCs derive identity from the authenticated session and whitelist mutable fields. This prevents a client from self-verifying a licence, changing account status, or assigning a device to another veterinarian.

## Audit model

`audit_events` is append-only. Application roles receive read access to their own events but no insert, update, or delete privileges. Trusted functions create events with minimal metadata and no clinical prose.

## Known Phase 1 boundary

Biometric relocking is implemented. A custom local PIN is deliberately not implemented yet because a production PIN must be coupled to encrypted local-database key management, retry throttling, and secure recovery. A superficial PIN hash would create false security.
