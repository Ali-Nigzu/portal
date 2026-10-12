# camOS deployment and operations

## Build and launch

```sh
docker build -t camos .
docker run --env-file /path/to/runtime.env -p 8080:8080 camos
```

Docker uses BuildKit. Networks with an additional certificate authority may pass
an existing trusted CA bundle with `--secret id=build_ca,src=/path/to/ca-bundle.pem`.
The optional mount is used only during package installation; it is absent from
the application image. Without that input, npm and pip use their normal trust.

The pinned Node 24 build stage runs `npm ci` and `npm run build`. Vite compiles React/
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
| `PORTAL_SESSION_SECRET` | Stable secret of at least 32 characters; session signatures, lifecycle HMACs, and purpose-separated encrypted OIDC tickets |
| `PORTAL_SESSION_SECURE` | Optional explicit Secure-cookie policy; unset uses production environment |
| `CLOUD_SQL_INSTANCE` | Default `camosbase:europe-west2:camos-prod-postgres` |
| `PORTAL_DB_NAME` | Default `camos_prod` |
| `PORTAL_DB_USER` | Default `portal-reader@camosbase.iam`; must match actual IAM DB principal |
| `PORTAL_DOCUMENTS_BUCKET` | Default `camos-prod-1`; private Documents bucket |
| `BQ_PROJECT`, `GOOGLE_CLOUD_PROJECT` | BigQuery client project selection |
| `BQ_LOCATION`, `GOOGLE_CLOUD_LOCATION` | BigQuery client location selection |
| `PORTAL_BQ_MAX_BYTES` | Canonical query maximum bytes billed; default 1,000,000,000 |
| `POSTMARK_SERVER_TOKEN` | Required email provider secret |
| `POSTMARK_FROM_EMAIL` | Required verified sender |
| `ADMIN_NOTIFY_EMAIL` | Notification recipients; existing default `ali@camos.app` |
| `POSTMARK_EMAIL_ENDPOINT` | Optional provider endpoint, default Postmark `/email` |
| `CLOUD_RUN_SERVICE_URL`, `PRODUCTION_DOMAIN` | Existing origin inputs; PRODUCTION_DOMAIN remains a hostname, e.g. `camos.app` |
| `GOOGLE_CLIENT_ID`, `MICROSOFT_CLIENT_ID` | Public IDs read by backend; never needed in the frontend bundle |
| `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_SECRET` | Private backend token-exchange secrets; bind via the established runtime secret mechanism |
| `PORTAL_DEMO_NOW` | Optional canonical Demo effective cutoff; preserves current Demo clock behaviour |
| `DEMO_SESSION_SECURE` | Existing Demo bootstrap Secure-cookie setting |
| `DEMO_NOW_TIMEZONE` | Canonical Demo clock, default Europe/London |

Signup notification environment labels retain the existing precedence of
`REACT_APP_ENVIRONMENT`, `ENVIRONMENT`, `APP_ENV`, `RAILWAY_ENVIRONMENT`.
These are backend notification labels, not alternate application composition.

Frontend requests use same-origin URLs. The container serves the SPA and API together.

## Google and Microsoft authentication

Provider config is optional at application construction. Missing config returns
a controlled unavailable state for that provider; first-party auth still works.
Use PRODUCTION_DOMAIN=camos.app, preserving its hostname semantics. Provider
callbacks always use HTTPS and never derive from Host/forwarded/browser input:

- https://camos.app/api/auth/google/callback
- https://camos.app/api/auth/microsoft/callback

Use established Cloud Run secret bindings, preferably Secret Manager, for the
two client secrets. No provisioning or deployment is performed by application code.
Google uses openid/email/profile, requires email_verified for new Signup, and
currently has an External Testing registration limiting live authorization to
approved test users. Microsoft common/v2 supports organizational and personal
accounts; validate issuer, tenant and signing-key issuer metadata. New Microsoft
Signup verifies its suggested mailbox through camOS before user creation.

Random Codespace domains cannot complete production callback transactions.
Real browser round trips require an explicitly registered matching origin; do
not weaken callback/state/cookie checks. Validate deployed cookies behind the
proxy, runtime bindings, actual schema/privileges, both provider round trips,
cancellation, first signup, known login, linking, and canonical Portal access.
Local mocks are not live provider E2E evidence.

Application password attempts now have a shared account/namespace budget of 30
per 15 minutes. Challenge starts have five per account/purpose per hour. These
use non-credential `budget:` rows in the existing lifecycle table with advisory
transaction/row locks; no schema change or username uniqueness is required.
Verify deployment-level broad traffic controls before public rollout.
Check for enabled NULL-password users with no identity mapping. Reverse-proxy
access logs must also redact query strings for provider callbacks; the application
redacts its own Uvicorn callback queries and never logs provider payloads.

## Provider permissions

Cloud SQL requires the existing Connector/IAM connectivity permissions and the
matching IAM PostgreSQL principal. The runtime must have SELECT on canonical
read tables and the explicit INSERT/UPDATE rights needed for users,
organisations, memberships, device/Gateway controls and Admin rows. Lifecycle
cleanup/completion requires DELETE on `user_lifecycle_challenges`.
The existing `public.user_auth_identities` table requires SELECT and INSERT only,
plus USAGE on its identity sequence. No UPDATE, DELETE, DDL or owner privilege is
needed. Check effective inherited/PUBLIC rights separately; do not grant broadly.

Identity sequence USAGE is needed for applicable users/organisations/sites/
devices/alarms inserts. Organisation soft deletion requires UPDATE on
`organisations`. Do not replace these specific rights with ownership, superuser,
schema-creation, blanket DELETE or default privileges on future tables.

BigQuery requires job creation and reads on the actual Event dataset/table only. GCS requires private object
list/read/create/delete access for the Documents service with generation
preconditions. Documents do not use public ACLs, public links or signed URLs.
Postmark requires a verified sender and valid server token.

Effective PostgreSQL privileges include inherited roles and PUBLIC grants;
direct REVOKE does not override inherited permissions. Inspect effective grants
before deployment. No command in this repository automatically changes live
GCP/IAM, Cloud Run, database schema or production rows.

## Persistence paths and operational checks

The working directory is `/app`. Contact retains
`backend/data/contact_submissions.json` and atomic `.tmp` replacement. Preserve
the deployment's current storage/lifetime policy for that path; email delivery
does not roll back a saved journal record.

The application serves SPA assets and browser deep links from the same process.
`/health` currently follows the SPA fallback and is not a provider-health API.
Public OpenAPI/Swagger/ReDoc routes are disabled. Static availability alone does
not verify provider permissions or lifecycle delivery.
Assess provider configuration and effective database permissions before deployment.

## Focused multi-auth verification

Install backend test dependencies with `pip install -r backend/tests/requirements.txt`.
Run `python -m unittest discover -s backend/tests -t . -v` from repository root.
OIDC/crypto unit tests run without a database. Integration tests require an
explicit disposable localhost PostgreSQL named camos_auth_test with camos_test
credentials and `CAMOS_TEST_POSTGRES_PORT`; they create/truncate test tables only.
Without that opt-in the integration tests report skipped, not passed. Never point
the test helper at production; it has no configurable production host or ADC path.
Run frontend `npm ci && npm run build` and the complete Docker build separately.
Vite transpilation is not a full TypeScript type check.

## Production candidate resource settings

The image pins maintained Node 24 and Python 3.11 base digests, uses `npm ci`
and a complete pinned Python runtime closure. `requirements.in` records direct
requirements; refresh the closure in a clean Python 3.11 environment and rerun
quality gates when changing it. Test tooling stays out of the runtime closure.
Uvicorn is the single process/PID 1, with 64 admitted connections and a nine-second
graceful shutdown. Keep Cloud Run concurrency at or below 32 and memory at least
512 MiB; select maximum instances against PostgreSQL capacity: each instance can
hold four SQL connections, so reserve `4 × maximum instances` plus operator/other
service headroom. Do not raise concurrency or instance count without measuring
memory and provider/database quotas in the actual deployment.

`PORTAL_SESSION_SECRET` must have at least 32 characters and fails construction
when missing. Google/Microsoft config remains optional. `PORTAL_HASH_CONCURRENCY`
defaults to two (1–8); Argon2 strength is unchanged. Capacity is checked against
cgroup memory, and excess work fails safely after one second rather than growing
an unbounded hashing queue. SQL checkout/connect/statement bounds are 10 seconds,
lock wait three seconds, idle transaction 15 seconds; transactions still roll
back on failure and return healthy connections to the four-slot pool.

Contact requests are limited before parsing to 8 MiB, with two simultaneous
upload/delivery operations. Documents retains 25 MiB per file and has a 32 MiB
request bound matching the current Cloud Run HTTP/1 container limit. Ordinary
JSON bodies are bounded to 32 KiB, Admin bodies to the existing 32 MiB platform bound (one concurrent write). Contact attachments
reserve an 8,000,000-byte base64/metadata envelope plus provider body/MIME headroom;
normal type/count rules remain. The current JSON journal stays synchronous in
request order but runs in workers, with process/file locks and atomic replacement.
Corrupt history is preserved. Memory does not grow with total history, though
validation/copy cost does: retain an operator-reviewed journal retention/disk
budget. Cloud Run local disk is still ephemeral and instance-local; no new durable
Contact authority is implied. Postmark sends are not automatically retried.

BQ queries keep the 1 GB billed-byte limit, 10-second RPC/retry deadlines,
30-second result wait and bounded REST result counts. Device counts use one
aggregate for site totals plus required current device pairs, preserving historical
contributions without returning every historical device group. Row collection
checks a 40-second deadline (an in-progress RPC can finish up to its 10-second
bound). Event exports admit two concurrent bounded results. Private Portal responses,
including failures, use no-store; mutations retain the existing origin/marker guard.

Before promotion verify real IAM/SQL grants and sequence rights, GCS ownership and
generation preconditions, actual BQ schema/location/query execution and billed bytes,
Google/Microsoft registered callbacks and browser cookie behavior, Postmark sender
and customer delivery, Cloud Run quotas/scaling/termination window, and the external
snapshot producer's calendar/historical dwell contract. Local mocks, a successful
container build, and this scorecard do not establish these live facts.

## Reproducible quality gates

Use a disposable localhost PostgreSQL `camos_auth_test` with synthetic `camos_test`
credentials; never production ADC/database for tests. Set
`CAMOS_TEST_POSTGRES_PORT=55439` and a nonexistent test-only
`GOOGLE_APPLICATION_CREDENTIALS` path. Install `backend/tests/requirements.txt`
in an isolated environment, then run `python -m unittest discover -s backend/tests -v`
and `pip check`. The database helper refuses a production host/database.
At `frontend`, run `npm ci`, `npm run typecheck`, `npm test`, and
`npm run test:browser` after `npx playwright install --with-deps chromium`.
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` optionally selects an existing local Chromium;
CI uses the Playwright-pinned browser. Harness files are test-only and are absent
from the SPA bundle. The lean GitHub quality workflow repeats these gates and
builds/checks the production image. Keep secrets in secure injected environment
settings; pass names to Docker with `-e NAME`, never copy their values into files.
