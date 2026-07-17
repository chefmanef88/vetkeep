# Device and session revocation

## Phase 1 behaviour

VetKeep distinguishes a **registered device record** from a **Supabase Auth session**. Marking a database device row as revoked does not, by itself, invalidate an authentication token.

The Phase 1 security dashboard therefore uses a deliberately conservative containment flow:

1. The veterinarian completes MFA and chooses an active registered device.
2. VetKeep terminates every other Supabase refresh-token session by using the `others` sign-out scope.
3. VetKeep marks the selected device record as revoked through an AAL2-protected RPC.
4. The database refuses to re-register the same revoked device identifier.
5. An append-only audit event records the revocation reason and timestamp.

This action may sign out legitimate sessions on other devices. That trade-off is intentional: containment is more important than convenience when a device may be lost or compromised.

## Access-token window

Supabase access tokens cannot be individually revoked before their expiry. VetKeep therefore configures a 15-minute JWT lifetime. A terminated remote session can continue using an already-issued access token only until that token expires.

Production Supabase configuration must preserve the 900-second expiry unless a documented security review approves a different value.

## Local sign-out

Ordinary **Sign out** uses the `local` scope so it removes only the current session. It must never unexpectedly terminate all sessions.

## Phase 3 requirement

No clinical offline database is introduced in Phase 1. Before real clinical records are cached on a phone, Phase 3 must add:

- encrypted local clinical storage;
- active-device credential enforcement for sync requests;
- periodic online revocation checks;
- offline-access expiry;
- secure cryptographic erasure of local keys after revocation or account closure;
- lost-device and stolen-token tests on physical devices.

Device registration must not be described as hardware attestation. It is an account-controlled registry and containment mechanism.
