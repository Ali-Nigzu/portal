# Backend runtime environment variables

## User-facing email flows (Postmark)

These variables are required for signup verification, Contact Us admin notifications, and Contact Us user confirmations:

- `POSTMARK_SERVER_TOKEN`
- `POSTMARK_FROM_EMAIL` (set to `noreply@camos.app`)
- `ADMIN_NOTIFY_EMAIL` (optional; defaults to `ali@camos.app`)
- `POSTMARK_EMAIL_ENDPOINT` (optional; defaults to Postmark `/email`, primarily for runtime verification against a local provider stub)

If Postmark credentials are missing, email-dependent endpoints return an explicit `503` configuration error instead of reporting success while silently skipping email delivery. Signup admin-notification failures are logged after account creation so they cannot block verification completion.

## Canonical authentication and Cloud SQL

- `PORTAL_SESSION_SECRET` is required for login and session validation. It must be
  a stable secret of at least 32 characters supplied by the runtime secret store.
- `PORTAL_SESSION_SECURE` may explicitly control the cookie Secure flag. When it
  is unset, `NODE_ENV=production` enables Secure cookies.
- `CLOUD_SQL_INSTANCE` defaults to `camosbase:europe-west2:camos-prod-postgres`.
- `PORTAL_DB_NAME` defaults to `camos_prod`.
- `PORTAL_DB_USER` defaults to `portal-reader@camosbase.iam` and must name the
  actual IAM database principal used by the Cloud Run runtime identity.

Authenticated sessions have a fixed 365-day lifetime. User and membership state
is re-read from Postgres for protected requests; membership claims are never
stored in the cookie.

The database principal needs SELECT on the canonical Portal and authentication
tables, plus only these write privileges for authenticated controls:

```sql
GRANT UPDATE (enabled) ON public.devices TO "<actual portal DB user>";
GRANT UPDATE (desired_state) ON public.gateways TO "<actual portal DB user>";
```
