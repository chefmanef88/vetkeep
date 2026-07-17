# Environment separation runbook

## Local

- Runs with the Supabase CLI and Docker.
- Uses generated synthetic data only.
- Secrets live in uncommitted `.env.local` files.
- Auth access tokens expire after 900 seconds.

## Staging

- Separate Supabase project, Vercel project, and mobile application environment.
- Uses synthetic or explicitly de-identified test data.
- No production database connection or storage bucket access.
- Uses separate email, CAPTCHA, monitoring, and signing credentials.
- Mirrors production MFA, JWT expiry, RLS, rate limits, and security headers.

## Production

- Separate organisation/project ownership and least-privilege access.
- Schema changes only through reviewed migrations and protected CI deployment.
- Secret keys are available only to trusted server runtimes.
- Mobile and browser applications receive publishable keys only.
- TOTP MFA is enabled and required before private tenant data is readable.
- JWT expiry is set to 900 seconds unless a documented security review approves a change.
- Email confirmation and secure password-change protections are enabled.
- Auth rate limits and bot protection/CAPTCHA are configured before public signup is enabled.
- Redirect URLs are allow-listed exactly; wildcard production redirects are prohibited.
- Database backups, point-in-time recovery, alerting, and restore tests are enabled.
- Logs and monitoring must not contain clinical prose or direct client identifiers.

Never restore a production backup into local, preview, or staging environments.
