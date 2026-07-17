# ADR-002: Controlled mutations for security-sensitive tables

**Status:** Accepted

Authenticated clients receive SELECT privileges on their own foundation records but cannot directly mutate `vets`, `vet_devices`, or `audit_events`.

Security-definer RPCs:

- derive the acting user from `auth.uid()`;
- resolve the veterinarian tenant on the server;
- whitelist mutable fields;
- reject cross-tenant device IDs;
- append audit events.

This creates more database code than permissive CRUD policies, but it materially reduces privilege-escalation risk.
