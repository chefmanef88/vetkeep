# Runbook — hosted staging

Why staging exists: the mobile application currently points at a Supabase
instance on the development laptop, whose address changes with every network it
joins, and which is destroyed by `supabase db reset` during migration work. A
hosted project ends both, and is the precondition for putting the application in
front of an actual veterinarian.

Staging holds **test data only.** No real client, animal, or clinical record
belongs here. It is reachable from the internet and does not carry the
protections a production project is given in `environment-separation.md`.

---

## 1. The trap: migrations do not carry the auth configuration

This is the part that silently goes wrong, so it comes first.

`supabase/config.toml` governs the **local** stack only. Pushing migrations to a
hosted project applies schema, functions, policies and grants — and nothing
else. Every setting below lives in the hosted project's dashboard, and if it is
not set there, staging quietly falls back to Supabase defaults that are weaker
than what Phase 1 was accepted on.

| Setting                 | Required value  | Supabase default | Why it matters                                                                                     |
| ----------------------- | --------------- | ---------------- | -------------------------------------------------------------------------------------------------- |
| JWT expiry              | **900** seconds | 3600             | A 15-minute access token is a Phase 1 acceptance item                                              |
| Minimum password length | **12**          | 6                | Accepted in Phase 1                                                                                |
| MFA — TOTP              | **Enabled**     | Disabled         | Every RPC calls `require_aal2()`; without TOTP enrolment nobody can reach any clinical data at all |
| Email confirmations     | **Enabled**     | Varies           | The signup flow assumes a confirmation step                                                        |
| Signup                  | Enabled         | Enabled          | —                                                                                                  |

`require_aal2()` is the one that fails loudly rather than silently: with MFA
disabled in the dashboard, a user can sign in and then every clinical call
returns "Multi-factor authentication required". If that appears on a fresh
staging project, this table is the reason.

**Site URL and redirect URLs** must also be set, or email confirmation links
point at `localhost:3000` and the deep link back into the mobile application
never resolves:

- Site URL — the deployed web application's origin
- Additional redirect URLs — `<web origin>/auth/confirm` and `vetkeep://auth/confirm`

---

## 2. Create the project

Free tier, `eu-west-1` to match the organisation's other projects. Name it
`vetkeep-staging` so it can never be mistaken for production in a project list.

Record the project ref; everything below needs it.

## 3. Push the schema

```bash
npx supabase link --project-ref <ref>
```

```bash
npx supabase db push
```

`db push` applies migrations that have not run yet. It does **not** reset, so it
is safe against a project that already holds data — unlike `db reset`, which
drops everything and is local-only.

Verify the count matches the repository:

```bash
npx supabase migration list --linked
```

## 4. Do not seed

`supabase/seed.sql` runs on local reset only. Staging starts empty: sign up
through the application so the account goes through the real signup, email
confirmation, MFA enrolment and onboarding path. An account inserted directly
would skip exactly the flow staging exists to exercise.

## 5. Point the applications at it

Both keys are publishable and safe in a client bundle. The service role key is
**not**, is not needed by either application, and must never enter this
repository.

`apps/mobile/.env.local`

```
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
```

`apps/web/.env.local`

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
NEXT_PUBLIC_APP_URL=<web origin>
```

A rebuild of the mobile development client is required: `EXPO_PUBLIC_*` values
are inlined at bundle time, so editing the file without rebuilding leaves the
old address compiled in.

## 6. Verify before trusting it

1. Sign up, receive the confirmation email, confirm.
2. Enrol TOTP, then sign in and pass the challenge.
3. Complete veterinarian onboarding.
4. Create a client, then a folder for one dog and one poultry flock.
5. Attend a consultation on each. Confirm the dog is offered eleven examination
   systems and the flock none.
6. Record a treatment on the flock and confirm withholding dates are computed.
7. Sign the record, then share the client's copy.
8. Confirm the audit trail carries the signing and the disclosure.

Anything that fails at step 2 is almost certainly section 1 of this runbook.

## 7. Take the laptop off the network

Once the phone talks to staging, the development machine no longer needs to be
reachable. Remove both firewall rules, in an Administrator PowerShell:

```powershell
Remove-NetFirewallRule -DisplayName "Metro dev 8081"; Remove-NetFirewallRule -DisplayName "Supabase local dev 54321"
```

These rules exposed a local clinical database to whatever network the laptop was
attached to, including a university network. They exist for on-device testing
against the local stack and should not outlive it.

---

## What staging is not

- **Not production.** No real clinical data, ever.
- **Not backed up.** See `backup-restore.md` for what production requires.
- **Not a place to test destructive migrations.** Use the local stack for that;
  that is what `db reset` is for, and why it is local-only.
