# Real organisation Demo dashboard

Only the Demo dashboard uses PostgreSQL. The public wrapper supplies integer organisation ID `1` to a reusable read service; query parameters, cookies and view tokens cannot choose another organisation. A site read includes both its ID and organisation ownership in SQL. The service reads only `public.organisations`, `public.sites`, `public.organisation_snapshots` and `public.site_snapshots`, using parameterized SELECTs. Snapshot `state` is neither queried nor returned.

The frontend resolves name slugs through the context API. IDs are lossless decimal strings internally, never dashboard URL segments. `/demo` and existing dashboard entry links redirect to the current organisation name. Unknown organisation/site slugs show not-found. Names and enabled flags come from context; disabled sites remain listed. Normalization collisions receive a deterministic name hash, without IDs or slug history.

One abortable provider loads and freezes one selected snapshot. All cards use that same payload and `ts`; selection and explicit retry load one new snapshot. Period changes are projections only. There is no polling, positional parser or legacy fallback in this path. The 96 rolling timestamps end at the UTC quarter-hour containing `ts`. Period labels use UTC hours/days, ISO weeks, January–December for `year`, and consecutive years ending at the snapshot year for `all_time`. Dwell seconds are divided by 60 once for display. Canonical analytics remain integers, and rolling and named-period occupancy preserve Snapshot's `[average_positive, minimum_positive, maximum]` triples; the occupancy KPI selects the supplied average while Site Flow retains the supplied range. Displayed capacity can exceed 100%. Demographics contain six Age and two Sex values only. Portal performs only lightweight response-envelope checks and does not duplicate Snapshot analytics validation.

Event Logs, Alarm Logs, Reports, Devices, the authenticated/view-token dashboard, email/signup and the landing preview retain their existing loaders and behavior. Dashboard navigation into those Demo sections retains their legacy selected site. This migration does not map production sites onto fake legacy sites.

## Dedicated Portal identity and one-time provisioning

Intended service account: `portal-reader@camosbase.iam.gserviceaccount.com`.

Exact IAM database username: `portal-reader@camosbase.iam`.

The account and key do not exist yet. No existing Gateway/TestAdmin credentials were read or reused. These commands are for a project administrator to run once; the application never runs them.

The service account needs **Cloud SQL Client** (`roles/cloudsql.client`) for connector access and **Cloud SQL Instance User** (`roles/cloudsql.instanceUser`) for IAM database login. It does not need Cloud SQL Admin or Service Account Token Creator for this key-based connector flow. See [IAM login requirements](https://docs.cloud.google.com/sql/docs/postgres/iam-logins) and [IAM service account database provisioning](https://docs.cloud.google.com/sql/docs/postgres/add-manage-iam-users).

```sh
gcloud services enable sqladmin.googleapis.com --project=camosbase
gcloud iam service-accounts create portal-reader --project=camosbase --display-name="Portal snapshot reader"
gcloud projects add-iam-policy-binding camosbase --member="serviceAccount:portal-reader@camosbase.iam.gserviceaccount.com" --role="roles/cloudsql.client"
gcloud projects add-iam-policy-binding camosbase --member="serviceAccount:portal-reader@camosbase.iam.gserviceaccount.com" --role="roles/cloudsql.instanceUser"
gcloud sql instances describe camos-prod-postgres --project=camosbase --format="yaml(connectionName,settings.databaseFlags)"
gcloud sql users create portal-reader@camosbase.iam --instance=camos-prod-postgres --project=camosbase --type=cloud_iam_service_account
```

Confirm `cloudsql.iam_authentication=on` on the existing instance before adding/logging in the IAM user. If it is absent, enable that flag through the instance's database-flags editor while preserving all existing flags; this can require an instance restart. Do not replace the production flag list with a one-flag patch.

Connect an existing database administrator to **camos_prod** and run:

```sql
REVOKE ALL PRIVILEGES ON DATABASE camos_prod FROM "portal-reader@camosbase.iam";
GRANT CONNECT ON DATABASE camos_prod TO "portal-reader@camosbase.iam";

REVOKE ALL PRIVILEGES ON SCHEMA public FROM "portal-reader@camosbase.iam";
GRANT USAGE ON SCHEMA public TO "portal-reader@camosbase.iam";

REVOKE ALL PRIVILEGES ON TABLE
  public.organisations, public.sites,
  public.organisation_snapshots, public.site_snapshots
FROM "portal-reader@camosbase.iam";
GRANT SELECT ON TABLE
  public.organisations, public.sites,
  public.organisation_snapshots, public.site_snapshots
TO "portal-reader@camosbase.iam";

-- Defense in depth; the grants above are the SQL permission boundary.
ALTER ROLE "portal-reader@camosbase.iam" IN DATABASE camos_prod
  SET default_transaction_read_only = on;
```

Do not grant table ownership, `cloudsqlsuperuser`, write-capable roles, sequence rights or default privileges for future tables to this new user. PostgreSQL privileges are additive: a direct REVOKE cannot override privileges inherited from `PUBLIC` or another role. Check effective privileges before calling this account SELECT-only. These read-only checks should show SELECT=true and every write/CREATE column=false:

```sql
SELECT table_name,
  has_table_privilege('portal-reader@camosbase.iam', table_name, 'SELECT') AS can_select,
  has_table_privilege('portal-reader@camosbase.iam', table_name, 'INSERT') AS can_insert,
  has_table_privilege('portal-reader@camosbase.iam', table_name, 'UPDATE') AS can_update,
  has_table_privilege('portal-reader@camosbase.iam', table_name, 'DELETE') AS can_delete,
  has_table_privilege('portal-reader@camosbase.iam', table_name, 'TRUNCATE') AS can_truncate,
  has_table_privilege('portal-reader@camosbase.iam', table_name, 'REFERENCES') AS can_reference,
  has_table_privilege('portal-reader@camosbase.iam', table_name, 'TRIGGER') AS can_create_trigger
FROM (VALUES ('public.organisations'), ('public.sites'),
  ('public.organisation_snapshots'), ('public.site_snapshots')) AS tables(table_name);

SELECT has_database_privilege('portal-reader@camosbase.iam', 'camos_prod', 'CONNECT') AS can_connect,
  has_database_privilege('portal-reader@camosbase.iam', 'camos_prod', 'CREATE') AS can_create_schema,
  has_schema_privilege('portal-reader@camosbase.iam', 'public', 'USAGE') AS can_use_schema,
  has_schema_privilege('portal-reader@camosbase.iam', 'public', 'CREATE') AS can_create_object;

SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
FROM pg_roles WHERE rolname = 'portal-reader@camosbase.iam';
SELECT parent.rolname AS inherited_role
FROM pg_auth_members AS m JOIN pg_roles AS parent ON parent.oid = m.roleid
JOIN pg_roles AS member ON member.oid = m.member
WHERE member.rolname = 'portal-reader@camosbase.iam';
```

If an effective write/CREATE privilege remains, the DBA must remove its granting role/PUBLIC grant and retain necessary rights on the existing application roles. There is no per-user DENY in PostgreSQL. Do not blindly revoke shared PUBLIC permissions on this production instance without accounting for its other applications. See [PostgreSQL privileges](https://www.postgresql.org/docs/current/ddl-priv.html).

## Credentials and runtime

Supply the new account's credential JSON at `<portal-repo-root>/sa.json` through the normal secret provisioning process. It is ignored by Git and Docker and never imported by frontend code. In the current Docker image the resolved location is `/app/sa.json`; mount it read-only at runtime, rather than copying it into an image. No key creation was performed by this migration.

The connector authenticates to `camosbase:europe-west2:camos-prod-postgres`, database `camos_prod`, with `enable_iam_auth=True` and the username derived by removing `.gserviceaccount.com` from the credential email. No password or DSN fallback exists. The process shares one lazy connector, bounds concurrent request-owned connections to four, and closes each SQL connection. Missing credentials or a database outage return a sanitized dashboard error; startup and unrelated APIs do not require the key.

## Verification

Run from the repository root with backend dependencies and pytest/httpx installed:

```sh
ANALYTICS_OFFLINE_MODE=true python -m pytest -q backend/tests
cd frontend
npm ci
node scripts/organisation-dashboard-tests.mjs
node scripts/reports-engine-tests.mjs
npm run build
```

For browser assertions, serve the production build on `127.0.0.1:4173`, then run `node scripts/organisation-dashboard-browser.mjs`. The test intercepts all API calls with test data; it never contacts production. It uses installed Edge by default; set `DASHBOARD_BROWSER_CHANNEL=chrome` to use Chrome. Screenshots go to ignored `frontend/test-results/`.

Live Cloud SQL verification must follow service-account/user/grant provisioning. It has not been represented as a passing test. No production mutation tests are required: verify context and organisation/site snapshot GETs, and use the privilege inspection SELECTs above.

Recorded implementation results (14 September 2026):

- Backend suite: **39 passed** using Python 3.12; `pip check` found no broken requirements. The Docker image remains Python 3.11; a container build was not run on this Windows host.
- Canonical projection/mapping/slug assertions: passed.
- Built-frontend browser assertions in Edge: passed for default organisation entry, dynamic desktop/mobile selection, owned-site requests, unknown slugs, canonical integer/triple values, capacity headline/tooltip above 100%, period changes without requests, explicit retry, no polling, and no legacy API fallback. Screenshots were visually inspected.
- Existing Reports engine tests: passed.
- Vite production build: passed. On Windows, the Vite build command was run directly because the existing npm build script ends with a POSIX copy command; that script and the Docker build process are unchanged.
- Supplementary TypeScript check: the same seven pre-existing errors in shared `ChartRenderer.tsx` and `VRMLayout.tsx` reproduce at the exact approved baseline. No additional errors were reported for the new core.
- Existing landing topology geometry check in Edge: the traffic connector measures 7px against a 6px threshold on **both** this branch and the exact baseline. This unrelated existing assertion was not relaxed.
- Direct comparison confirms PR #299's auth/email and first-load preview files, legacy Demo loaders, Event/Alarm Logs, Reports, Devices, Demo session helpers and overlay are unchanged. No key was tracked or bundled, and no production SQL was run.
