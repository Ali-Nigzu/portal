# camOS deployment and operations

## Build and launch

```sh
docker build -t camos .
docker run --env-file /path/to/runtime.env -p 8080:8080 camos
```

The Node 20 build stage runs `npm ci` and `npm run build`. Vite compiles React/
TypeScript with its build pipeline and writes `frontend/build`. The Python 3.11
stage installs `backend/requirements.txt`, copies backend code and embeds the
SPA as `backend/frontend_build`. Build-only dependencies are absent from the
Python runtime image.

The sole application process is:

```sh
uvicorn backend.fastapi_app:app --host 0.0.0.0 --port "${PORT:-8080}"
```

`create_app()` supplies real PostgreSQL, BigQuery and GCS services. Postmark is
called by the real lifecycle/Contact flows. Startup runs lifecycle cleanup and
the bounded BigQuery check; shutdown closes owned external resources. Startup
does not execute migrations, grants or provisioning.

## Runtime identity, environment and secrets

Use the existing deployment runtime identity and application default credentials
for Cloud SQL, BigQuery and GCS. Keep secrets in the runtime secret store, never
in tracked files or the frontend bundle.

| Setting | Contract |
| --- | --- |
| `PORT` | Uvicorn port, default 8080 |
| `NODE_ENV=production` | Production origin/cookie settings; set in Dockerfile |
| `PORTAL_SESSION_SECRET` | Stable secret of at least 32 characters; session signatures and lifecycle code HMACs |
| `PORTAL_SESSION_SECURE` | Optional explicit Secure-cookie policy; unset uses production environment |
| `CLOUD_SQL_INSTANCE` | Default `camosbase:europe-west2:camos-prod-postgres` |
| `PORTAL_DB_NAME` | Default `camos_prod` |
| `PORTAL_DB_USER` | Default `portal-reader@camosbase.iam`; must match actual IAM DB principal |
| `PORTAL_DOCUMENTS_BUCKET` | Default `camos-prod-1`; private Documents bucket |
| `BQ_PROJECT`, `GOOGLE_CLOUD_PROJECT` | BigQuery client project selection |
| `BQ_LOCATION`, `GOOGLE_CLOUD_LOCATION` | BigQuery client location selection |
| `PORTAL_BQ_MAX_BYTES` | Canonical query maximum bytes billed; default 1,000,000,000 |
| `ANALYTICS_OFFLINE_MODE=true` | Skips only startup BigQuery health check; does not replace Event services |
| `POSTMARK_SERVER_TOKEN` | Required email provider secret |
| `POSTMARK_FROM_EMAIL` | Required verified sender |
| `ADMIN_NOTIFY_EMAIL` | Notification recipients; existing default `ali@camos.app` |
| `POSTMARK_EMAIL_ENDPOINT` | Optional provider endpoint, default Postmark `/email` |
| `CLOUD_RUN_SERVICE_URL`, `PRODUCTION_DOMAIN`, `REPLIT_DOMAINS` | Existing configured origin inputs |
| `DEMO_SESSION_SECURE` | Existing Demo bootstrap Secure-cookie setting |
| `DEMO_NOW_TIMEZONE` | Positional preview wall clock, default Europe/London |

Signup notification environment labels retain the existing precedence of
`REACT_APP_ENVIRONMENT`, `ENVIRONMENT`, `APP_ENV`, `RAILWAY_ENVIRONMENT`.
These are backend notification labels, not alternate application composition.

Frontend build inputs are `VITE_API_URL` and `VITE_ENVIRONMENT`. Production
requests on the deployed domain default to same-origin; an explicit API URL
retains its configured behavior. Vite does not consume the removed CRA
`.env.production` settings. Browser API configuration is public, never secret.

The retained positional preview contract also reads `BQ_DATASET`,
`LOCAL_COMBINED_SNAPSHOTS_DB` (default `combined_logs_snapshots.db`),
`LOCAL_SITE_A_SNAPSHOTS_DB` (default `user0_snapshots.db`) and
`LOCAL_SITE_B_SNAPSHOTS_DB` (default `user1_snapshots.db`). Source absence and
strict-request failure/fallback behavior are defined in
[data-contracts.md](data-contracts.md). They do not select another application.

## Provider permissions

Cloud SQL requires the existing Connector/IAM connectivity permissions and the
matching IAM PostgreSQL principal. The runtime must have SELECT on canonical
read tables and the explicit INSERT/UPDATE rights needed for users,
organisations, memberships, device/Gateway controls and Admin rows. Lifecycle
cleanup/completion requires DELETE on `user_lifecycle_challenges`.
Identity sequence USAGE is needed for applicable users/organisations/sites/
devices/alarms inserts. Organisation soft deletion requires UPDATE on
`organisations`. Do not replace these specific rights with ownership, superuser,
schema-creation, blanket DELETE or default privileges on future tables.

BigQuery requires job creation and reads on the actual Event dataset/table and
any configured retained preview snapshot table. GCS requires private object
list/read/create/delete access for the Documents service with generation
preconditions. Documents do not use public ACLs, public links or signed URLs.
Postmark requires a verified sender and valid server token.

Effective PostgreSQL privileges include inherited roles and PUBLIC grants;
direct REVOKE does not override inherited permissions. Inspect effective grants
before deployment. No command in this repository automatically changes live
GCP/IAM, Cloud Run, database schema or production rows.

## PostgreSQL operator sources

`ops/postgres/internal_admin_audit.sql` is read-only. It prints columns,
constraints/indexes, effective table/sequence rights and suggested missing GRANT
statements. It does not execute those generated statements.

```sh
psql "$OPERATOR_DATABASE_URL" -f ops/postgres/internal_admin_audit.sql
```

The remaining SQL sources have specific provisioning applicability:

| Source | Applicability |
| --- | --- |
| `001_organisation_membership_states.sql` | Administrator transition from the old two-status constraint; deliberately rejects an already-migrated/unexpected schema |
| `002_canonical_user_lifecycle.sql` | Future-environment identity/index/session-version/challenge provisioning; not application startup |
| `002_canonical_user_lifecycle_grants.sql` | Future-environment user/sequence/challenge grants for an explicit principal |

Inspect the target schema first; do not replay a one-time transition on an
already-current database. These files are executable provisioning sources,
not a complete empty-database bootstrap. The complete current field/type
contract is the static registry and [data-contracts.md](data-contracts.md).

## Persistence paths and operational checks

The working directory is `/app`. Contact retains
`backend/data/contact_submissions.json` and atomic `.tmp` replacement. Preserve
the deployment's current storage/lifetime policy for that path; email delivery
does not roll back a saved journal record. The retained preview payload is
`backend/data/demo_snapshot.json`.

The application serves SPA assets and browser deep links from the same process.
`/health` currently follows the SPA fallback and is not a provider-health API.
Public OpenAPI/Swagger/ReDoc routes are disabled. Static availability alone does
not verify provider permissions or lifecycle delivery.
Use the read-only database audit and the actual provider configuration to assess
those dependencies. Build automation performs only the container build.
