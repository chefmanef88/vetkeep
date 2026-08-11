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

## 1. The trap: `db push` does not carry the auth configuration

This is the part that silently goes wrong, so it comes first.

`supabase db push` applies schema, functions, policies and grants — and nothing
else. It does **not** touch authentication settings. Without the step below,
staging falls back to Supabase defaults weaker than what Phase 1 was accepted
on, and the schema gives no hint that anything is wrong.

**The fix is one command, not a dashboard visit:**

```bash
npx supabase config push
```

It sends the `[auth]`, `[api]` and `[storage]` blocks of `config.toml` to the
linked project and prints a diff of what it is about to change. This is worth
preferring over the dashboard for a reason beyond convenience: a value clicked
into a web form is a value nobody can review, diff, or reproduce on the next
project. In `config.toml` it is in version control with everything else.

The diff it printed the first time it ran against staging, which is exactly the
drift this section warns about:

```
-jwt_expiry = 3600            +jwt_expiry = 900
-minimum_password_length = 6  +minimum_password_length = 12
-additional_redirect_urls = []
+additional_redirect_urls = ["http://localhost:3000/auth/confirm", "vetkeep://auth/confirm"]
```

Two things to know about it:

- **`storage.vector` must be disabled explicitly.** The CLI defaults it on, a
  free-tier project cannot have it, and the resulting 402 aborts the whole
  storage push — silently leaving the file size limit at the 50MiB default
  rather than the 25MiB the attachments specification calls for. `config.toml`
  now sets it to `false`.
- **`site_url` is `http://localhost:3000`**, which is right while the web
  application runs locally. When it is deployed, change it there and push again
  rather than editing the dashboard.

For reference, these are the settings involved and what they cost if missed:

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

## 2. The project

**Decided 11 August 2026: `vettrack`, ref `bnpokpjsencpxaetyfko`, `eu-west-1`.**

A new project was refused — the free tier allows two active projects per
administrator and the organisation already had two. Rather than pause an
unrelated product or upgrade the account, staging reuses `vettrack`, which
turned out to be an abandoned VetKeep: the same tables, the same `audit_events`
comment as this repository, this repository's first three migrations, and **zero
rows in every table.** Nothing is lost by bringing it current.

Renamed to `vetkeep-staging` in the dashboard on 11 August so the project list
stops describing it as something else.

### Reusing a project: what "empty" does not cover

The assessment above — no rows, known migration history, same product — was not
sufficient, and it is worth recording why.

`vettrack` had an earlier life before those three migrations. Left behind from it
was a trigger, `on_auth_user_created` on **`auth.users`**, calling
`private.handle_new_staff_signup()`, which inserted into a `public.staff_profiles`
table that no longer existed. Migrations only ever added to this project, so
nothing removed it. Every signup returned:

```
500  relation "public.staff_profiles" does not exist (SQLSTATE 42P01)
```

Nothing in the schema hints at it. `db push` succeeds, the tables are right, the
advisors are clean, and authentication fails at the first real use. The trigger,
the function and the empty `private` schema were dropped on 11 August.

**Before reusing any existing project, check beyond the public schema:**

```sql
select tgname, tgrelid::regclass::text, pg_get_triggerdef(oid)
from pg_trigger where not tgisinternal and tgrelid::regclass::text like 'auth.%';
```

```sql
select nspname from pg_namespace
where nspname not like 'pg_%'
  and nspname not in ('information_schema','public','auth','storage','extensions',
                      'graphql','graphql_public','realtime','vault','supabase_migrations',
                      'app_private','pgbouncer','net','cron','supabase_functions');
```

Row counts describe the data. Neither describes what runs on insert.

## 3. Push the schema

This step needs the CLI authenticated. The MCP connector cannot substitute:
`apply_migration` stamps a version of its own choosing, which would desynchronise
the migration history from this repository and make every future `db push`
attempt to replay work already done.

```bash
npx supabase login
```

```bash
npx supabase link --project-ref bnpokpjsencpxaetyfko
```

```bash
npx supabase db push
```

Eighteen migrations are outstanding — everything from `202608020002_phase2_visits`
onward.

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

Both files are already written, with the real URL and publishable key in them:
`apps/mobile/.env.staging` and `apps/web/.env.staging`. They are deliberately
**not** `.env.local`, because pointing the applications at a project whose schema
is still at Phase 2 produces an application that signs in and then fails on every
clinical call.

Once the push in section 3 has run:

```bash
cp apps/mobile/.env.staging apps/mobile/.env.local && cp apps/web/.env.staging apps/web/.env.local
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
