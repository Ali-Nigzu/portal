# Real organisation Demo dashboard

Only the Demo dashboard uses PostgreSQL. The public wrapper supplies integer organisation ID `1` to a reusable read service; query parameters, cookies and view tokens cannot choose another organisation. A site read includes both its ID and organisation ownership in SQL. The service reads only `public.organisations`, `public.sites`, `public.devices`, `public.organisation_snapshots` and `public.site_snapshots`, using parameterized SELECTs. Snapshot `state` is neither queried nor returned.

The frontend resolves name slugs through the context API. IDs are lossless decimal strings internally, never dashboard URL segments. Bare `/demo` selects owned Site ID `2` in the Demo wrapper and redirects using that site's current relational slug; there is no hardcoded site name or slug. If Site 2 is absent, Demo shows a configuration error with Retry. Existing `site-a`, `site-b` and `all` dashboard aliases still redirect to the organisation. Explicit organisation/site deep links retain their selection, and unknown slugs show not-found. Names and enabled flags come from context; disabled sites remain listed. Normalization collisions receive a deterministic name hash, without IDs or slug history.

Context includes a `realtime` boolean on each site and the organisation. A site is Realtime when at least one of its devices satisfies `analyzed_until >= CURRENT_TIMESTAMP - INTERVAL '15 minutes'`; exactly fifteen minutes qualifies, null does not, and no devices means Offline. One site SELECT derives these booleans with `EXISTS`, and organisation Realtime is `any` owned site Realtime (false for no sites). Device enabled flags, gateways and Snapshot timestamps are not involved. The header's separate System ON/OFF comes directly from the selected site's or organisation's own `enabled` flag. The two statuses are independent. Local time keeps the established browser-local display and one-minute cadence.

Realtime is evaluated by PostgreSQL on each normal context fetch. There is no polling or browser-clock expiry; a long-open page retains that response's status until the next context fetch. This is intentional for this phase. Context failures remain real sanitized errors; missing privileges never produce fake status.

One abortable provider loads and freezes one selected snapshot. All cards use that same payload and `ts`; selection and explicit retry load one new snapshot. Period changes are projections only. There is no polling, positional parser or legacy fallback in this path. The 96 rolling timestamps end at the UTC quarter-hour containing `ts`. Period labels use UTC hours/days, ISO weeks, January–December for `year`, and consecutive years ending at the snapshot year for `all_time`. `dwell_time_96` contains whole integer minutes and is displayed directly. Canonical analytics remain integers, and rolling and named-period occupancy preserve Snapshot's `[average_positive, minimum_positive, maximum]` triples; the occupancy KPI selects the supplied average while Site Flow retains the supplied range. Displayed capacity can exceed 100%. Demographics contain six Age and two Sex values only. Portal performs only lightweight response-envelope checks and does not duplicate Snapshot analytics validation.

Event Logs, Alarm Logs, Reports, Devices, the authenticated/view-token dashboard, email/signup and the landing preview retain their existing loaders and behavior. Dashboard navigation into those Demo sections retains their legacy selected site. This migration does not map production sites onto fake legacy sites.

The Dashboard reuses the established responsive status header, including an animated Realtime wave and muted, stationary crossed Offline wave. The title has no visible Snapshot UTC line, but `ts` remains analytical data. Site Flow's Month/Quarter labels are now Last Month/Last Quarter without changing the existing four-/twelve-ISO-week semantics. Demographics keeps its donuts and interactive values without duplicate lists. Only occupancy points whose bucket start is at or before Snapshot `ts` are plotted; historical zero and the current partial bucket remain, and entrances/exits are unchanged. Chart validation permits only the canonical Site Flow occupancy prefix to be shorter. One themed accessible spinner covers session, context and Snapshot loading and respects reduced motion.

## Dedicated Portal identity and one-time provisioning

Intended service account: `portal-reader@camosbase.iam.gserviceaccount.com`.

Exact IAM database username: `portal-reader@camosbase.iam`.

The original provisioning recipe below is for a project administrator; the application never runs it. This phase does not create credentials or administer Cloud SQL. For an already provisioned Portal reader, the one additional operator action required before deploying or live-validating the new context query is:

```sql
GRANT SELECT ON TABLE public.devices TO "portal-reader@camosbase.iam";
```

The user will provision this grant separately. Controlled tests can run before it exists; live production Realtime context validation remains pending that grant. Do not broaden privileges or add a fallback to bypass it.

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
  public.organisations, public.sites, public.devices,
  public.organisation_snapshots, public.site_snapshots
FROM "portal-reader@camosbase.iam";
GRANT SELECT ON TABLE
  public.organisations, public.sites, public.devices,
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
FROM (VALUES ('public.organisations'), ('public.sites'), ('public.devices'),
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

The browser harness covers desktop (1440×900), tablet (768×1024), phone (390×844), all four enabled/Realtime combinations, long relational names, Site 2 routing and renamed slugs, Year line termination, demographic hover values, delayed loading success/failure/Retry for all three stages, and no timer-driven requests. The backend status tests execute the service's SELECTs in an isolated SQLite fixture with a frozen SQL clock and only interval/placeholder syntax adapted. They prove the inclusive boundary and ownership without claiming live PostgreSQL verification.

On narrow phones, the canonical header places the full relational title above the existing stacked statuses. The activity timeline scrolls horizontally to retain readable axes; its legend remains in view and keyboard/touch scrolling is supported. These refinements do not change shared chart primitives or navigation.

Live Cloud SQL verification must follow service-account/user/grant provisioning. It has not been represented as a passing test. No production mutation tests are required: verify context and organisation/site snapshot GETs, and use the privilege inspection SELECTs above.

Micro Phase 1 verification (19 September 2026):

- Backend dashboard tests: **23 passed**. Full backend suite with `ANALYTICS_OFFLINE_MODE=true`: **47 passed**, 0 failed (3 dependency deprecation warnings). `pip check`: no broken requirements.
- `node scripts/organisation-dashboard-tests.mjs`: **1 script passed**, including the narrow ChartRenderer validation regression cases.
- `node scripts/reports-engine-tests.mjs`: **1 script passed**.
- `node scripts/organisation-dashboard-browser.mjs`: **34 scenarios passed**, 0 failed, against the production build in Edge using controlled API fixtures.
- `node node_modules/vite/bin/vite.js build`: passed, with the existing large-chunk warning. The Windows host used matching-version `esbuild-wasm` locally because the native compiler could not traverse sandboxed ancestor directories; no dependency manifest, lockfile or build-script changes were made.
- `git diff --check`: passed. Desktop/tablet/phone screenshots were inspected, including header states, long names, loaders, demographics, and Year occupancy stopping at September.
- No live PostgreSQL verification or provisioning was performed. Production Realtime context still requires the separately supplied devices SELECT grant.

Historical implementation results (14 September 2026):

- Backend suite: **39 passed** using Python 3.12; `pip check` found no broken requirements. The Docker image remains Python 3.11; a container build was not run on this Windows host.
- Canonical projection/mapping/slug assertions: passed.
- Built-frontend browser assertions in Edge: passed for default organisation entry, dynamic desktop/mobile selection, owned-site requests, unknown slugs, canonical integer/triple values, capacity headline/tooltip above 100%, period changes without requests, explicit retry, no polling, and no legacy API fallback. Screenshots were visually inspected.
- Existing Reports engine tests: passed.
- Vite production build: passed. On Windows, the Vite build command was run directly because the existing npm build script ends with a POSIX copy command; that script and the Docker build process are unchanged.
- Supplementary TypeScript check: the same seven pre-existing errors in shared `ChartRenderer.tsx` and `VRMLayout.tsx` reproduce at the exact approved baseline. No additional errors were reported for the new core.
- Existing landing topology geometry check in Edge: the traffic connector measures 7px against a 6px threshold on **both** this branch and the exact baseline. This unrelated existing assertion was not relaxed.
- Direct comparison confirms PR #299's auth/email and first-load preview files, legacy Demo loaders, Event/Alarm Logs, Reports, Devices, Demo session helpers and overlay are unchanged. No key was tracked or bundled, and no production SQL was run.
