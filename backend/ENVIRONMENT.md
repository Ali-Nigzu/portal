# Backend runtime environment variables

## User-facing email flows (Postmark)

These variables are required for signup verification, Contact Us admin notifications, and Contact Us user confirmations:

- `POSTMARK_SERVER_TOKEN`
- `POSTMARK_FROM_EMAIL` (set to `noreply@camos.app`)
- `ADMIN_NOTIFY_EMAIL` (optional; defaults to `ali@camos.app`)
- `POSTMARK_EMAIL_ENDPOINT` (optional; defaults to Postmark `/email`, primarily for runtime verification against a local provider stub)

Contact email configuration failures return `503`. Signup/unlock delivery failures
return recoverable `502` responses and retain their pending challenge for resend.
Password recovery acknowledgements remain generic for known, unknown, disabled,
and temporarily undeliverable accounts. Signup admin-notification failures are
logged after canonical account creation and cannot block verification completion.

## Canonical authentication and Cloud SQL

There is one production composition: canonical Cloud SQL, BigQuery and GCS.
For isolated local development without GCP, use the explicit fixture runner in
[development.md](../docs/development.md). It injects test services and is excluded
from production images; no environment variable selects another product backend.

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
stored in the cookie. A canonical session version revokes previous cookies when
passwords change or reset. Deploying the versioned cookie format signs existing
sessions out once.

Self-service organisation/access management also uses this canonical identity.
Apply the administrator-only membership migration before enabling its writes;
see [deployment and validation instructions](../docs/self-service-organisations.md).
The runtime needs SELECT/INSERT on organisations, USAGE on organisations_id_seq,
SELECT/INSERT/UPDATE on memberships and SELECT on users. No DDL, organisation
UPDATE/DELETE or membership DELETE is required. Invitations do not create users;
signup creates a verified canonical user with zero memberships. The
explicit development fixture does not provide lifecycle or membership mutations.

The locked user lifecycle schema and runtime grants are already applied live.
Migration/grant sources document that contract for future environments; do not
apply them to production for this correction. See [canonical lifecycle behavior and validation](../docs/canonical-user-lifecycle.md).
No runtime DDL or production migration is performed by the application.

Legacy JSON password authentication is disabled by default, and is always
disabled when `NODE_ENV=production`. `PORTAL_LEGACY_PASSWORD_AUTH=true` is an
explicit non-production compatibility opt-in only. Production uses canonical
Argon2 credentials; legacy view-token/demo mappings remain outside this migration.

The database principal also needs SELECT on the canonical Portal tables and
these existing write privileges for device/gateway controls:

```sql
GRANT UPDATE (enabled) ON public.devices TO "<actual portal DB user>";
GRANT UPDATE (desired_state) ON public.gateways TO "<actual portal DB user>";
```

## Private Documents (GCS)

Live mode uses only GCS. `PORTAL_DOCUMENTS_BUCKET` defaults to `camos-prod-1`;
it is server configuration and cannot be selected by the frontend. Each canonical
user accesses only `<user.id>/<filename>`. Opening/refreshing Documents lists the
bucket; login and startup do not scan it. No PostgreSQL metadata or signup folder
provisioning is needed.

The pinned `google-cloud-storage` client uses Application Default Credentials in
project `camosbase`. Codespace/Docker execution retains the read-only sa.json mount
with `GOOGLE_APPLICATION_CREDENTIALS=/app/sa.json`; production uses its existing
attached service identity. Never commit/copy the credential into the image.
The owner has already granted Storage Object Admin on this private bucket to
`portal-reader@camosbase.iam.gserviceaccount.com`. No bucket-admin/IAM changes are
required or performed by the application.

Uploads retain PDF/CSV/XLSX/DOCX and a 25 MiB per-file limit. Filenames are flat,
validated names; duplicate live objects are rejected atomically, never overwritten.
Downloads are authenticated backend attachments. Deletes use a generation
precondition; GCS Soft Delete remains a bucket feature without Portal restore UI.
Storage errors never fall back to local files.

The explicit dev/test runner injects an empty in-memory Documents adapter from
`backend/tests/support`; uploads disappear on process restart. It is not shipped
in the production image and is forbidden under `NODE_ENV=production`.
Old local Documents data is not imported, migrated, synchronized or dual-written.
Any required old files must be placed under canonical ID prefixes manually,
separately from this deployment. See [Documents contract and acceptance](../docs/documents-gcs.md).

## Retained compatibility contracts

See [the exhaustive compatibility surface](../docs/compatibility-surface.md).
Historical JSON/SQLite readers cannot supply canonical user or Admin sessions.
Contact JSON journaling remains active product behavior and is unchanged.
