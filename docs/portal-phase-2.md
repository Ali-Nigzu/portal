# Portal Phase 2 implementation

## Branch and boundary

Started from freshly fetched PR #302 head `c1c1a7f8621005e74d7b9d5d465244ce01bf24e7` in a new clean worktree, on `feat/portal-phase-2-canonical-data`. PR #302 is unchanged. This is stacked against `fix/demo-dashboard-ui-status-phase-1`.

One injected PortalProvider owns organisation identity, relational metadata, selected scope and clock. PortalApplication renders only the selected module. Module requests are abortable, scope-keyed and checked against the response identity; switching scope remounts module state and resets filters/cursors. Demo alone supplies public Org 1, bare-entry Site 2 and legacy aliases. Future authenticated adapters must resolve their own authorised identity before calling these same services; this change does not implement authenticated entitlements.

## Data paths

- Dashboard: existing canonical Postgres Snapshot service and projections. Header freshness/status, numeric Dwell headline, analytics and animation are unchanged.
- Events: server-only ADC BigQuery reads from `camosbase.camos_prod.events`, parameterised authorised organisation plus validated site/source predicates. Device filters are exact; gateway filters include that site's device events via OR, never relabel their origin. Initial search checks exact count against distinct non-null Event IDs before cursor paging. Pages default to 20 (maximum 100), ordered timestamp/Event ID descending. Continuations do not count again. No DataFrames or per-row SQL lookups.
- CSV: same scope, filters, clock and domain labels. A bounded query retrieves at most 100,001 records; over 100,000 fails explicitly before response streaming. The bounded accepted result streams CSV chunks, with formula-injection protection. It never silently exports only the browser page.
- Alarms: shared pooled Cloud SQL reader, explicit bulk joins and organisation/site predicates. Initial read-only repeatable-read transaction returns counts, active rows and newest 10 cleared rows. Cleared continuation orders started_at/id descending, fetches 11 to detect another page and appends 10. Counts are independent of loaded rows. More than 1,000 active rows requires narrower filters, not silent truncation. Lifecycle is only cleared_at nullability, even if a clear timestamp is beyond the demo cutoff.
- Devices: authorised context catalogue with exact device names, derived Gateway {site_id} labels and genuine analyzed_until (or Unavailable). No invented health, last-seen or traffic.
- Reports: the Demo API boundary alone maps canonical site 1/2/organisation to existing strict SQLite site-a/site-b/all sources. Other sites explicitly report unavailable. Existing calculations and PDF renderer remain. Scope switches abort generation before download.

The Demo clock is server-controlled UTC now unless PORTAL_DEMO_NOW specifies an aware ISO timestamp. Each module reuses the context cutoff; a request cannot raise it above the server's allowed present. Events use timestamp <= cutoff; Alarms use started_at <= cutoff. Production service identities may omit cutoff. Dashboard freshness continues to use its settled SQL-current-time rule.

## Runtime configuration and deployment gates

ADC runtime identity must be `portal-reader@camosbase.iam.gserviceaccount.com`. No service-account keys, IAM changes, SQL grants, migrations, seeding, indexes or deployment changes were made.

- Cloud SQL defaults: CLOUD_SQL_INSTANCE=camosbase:europe-west2:camos-prod-postgres, PORTAL_DB_NAME=camos_prod, PORTAL_DB_USER=portal-reader@camosbase.iam.
- One lazy Cloud SQL Connector and bounded SQLAlchemy QueuePool (pooling only, no ORM): four connections, no overflow, 10-second checkout/connect timeouts.
- BigQuery: existing BQ_PROJECT/GOOGLE_CLOUD_PROJECT and BQ_LOCATION configuration; canonical table is fixed. PORTAL_BQ_MAX_BYTES defaults to 1,000,000,000. Submission timeout 10 seconds, result timeout 30 seconds, cancellation on result failure.
- PORTAL_DEMO_NOW is optional; DEMO_NOW_TIMEZONE defaults to Europe/London.
- Preserve existing Reports SQLite deployment assets/config: LOCAL_COMBINED_SNAPSHOTS_DB, LOCAL_SITE_A_SNAPSHOTS_DB, LOCAL_SITE_B_SNAPSHOTS_DB.

**Deployment acceptance is pending**, not inferred from mocks. In candidate Cloud Run, verify its actual attached reader identity can read context metadata, public.alarms, canonical BigQuery Events, and both Dashboard Snapshot tables. Confirm the previously provisioned table permissions (especially Snapshot SELECT); do not broaden IAM to make tests pass. Validate full Alarm baselines before cutoff: site 1 = 2 active/318 cleared, site 2 = 2/438, organisation = 4/756, and source splits 214/106, 329/111, 543/217 device/gateway. Verify actual Event ID uniqueness and representative query latency/bytes under runtime identity.

## Validation

- Backend full suite: 92 passed, 0 failed; 3 dependency deprecation warnings. Includes Dashboard SQL semantics, Portal service/security negatives, cursor ties/reset, bounded export, cancellation and real isolated SQLite Reports adapter integration.
- Dashboard browser: 37 passed, 0 failed.
- Portal browser: 17 passed, 0 failed, including all-module site switching, organisation sources, delayed stale response, outage vs empty, Alarm 10/20/25, scoped CSV, both PDF downloads, missing Reports mapping, Devices and responsive 1440/768/390 layouts.
- Canonical projection/envelope/selection assertions: 1 script passed.
- ReportsEngine assertions: 1 script passed.
- Production Vite build: passed using locked npm dependencies.
- Dependency integrity: pip check passed. git diff --check passed.
- A repeat backend run initially had 8 setup errors from inaccessible old temporary/cache directories; rerunning with a fresh --basetemp and -p no:cacheprovider restored all 92 passes without source changes.
- Repository TypeScript diagnostic check: 56 errors, all matching existing baseline diagnostics (81 in the prior checkout with its installed dependencies). This is not a clean typecheck. Default configuration also references missing Jest types. No unrelated type fixes included.
- npm ci reported 19 dependency vulnerabilities (1 low, 5 moderate, 12 high, 1 critical); no unrelated dependency upgrades or audit fixes.

Reproduction: `ANALYTICS_OFFLINE_MODE=true python -m pytest backend/tests -q`; frontend `npm ci`, `node scripts/organisation-dashboard-tests.mjs`, `node scripts/reports-engine-tests.mjs`, `node node_modules/vite/bin/vite.js build`; start Vite preview and set PORTAL_TEST_URL for both browser scripts. Browser tests intercept APIs, not live GCP. Windows validation used a local esbuild-wasm resolver because native esbuild could not traverse sandboxed ancestor directories; no manifest/lockfile/build configuration workaround was committed. Direct Vite avoids the existing npm build script's POSIX copy tail.

## Legacy and exclusions

Removed canonical-path SQLite Event reader, synthetic Event transport/proofs, old source token arrays, frontend Alarm fixtures/JSON loaders and fabricated Device loaders. Legacy Event search now returns 410 instead of fake fallback. Removed files remain recoverable in Git.

Intentionally retained unrelated admin/account JSON storage and routes, authenticated/view-token legacy Dashboard paths, Reports strict SQLite analytics and compatibility utilities. No conversion of admin writes into Postgres writes.

Canonical Event UI/API/types/export contain no Race or Track ID. Existing Reports demographic semantics were deliberately preserved. No fake gateway devices, browser BigQuery access, Event-to-Dashboard coupling, Alarm writes, or hidden synthetic Event/Alarm fallback.

## File inventory

### Added

- `backend/app/api/portal.py`
- `backend/app/services/portal_alarms.py`
- `backend/app/services/portal_context.py`
- `backend/app/services/portal_events.py`
- `backend/tests/test_portal.py`
- `frontend/scripts/portal-browser.mjs`
- `frontend/src/components/PortalApplication.tsx`
- `frontend/src/components/PortalFilters.tsx`
- `frontend/src/context/PortalContext.tsx`
- `frontend/src/context/usePortalQuery.ts`
- `frontend/src/features/devices/CanonicalDeviceList.tsx`
- `frontend/src/features/organisation-dashboard/demoPortalSource.ts`
- `frontend/src/features/reports/PortalReports.tsx`
- `frontend/src/styles/PortalLogs.css`
- `docs/portal-phase-2.md` (this report)

### Modified

- `backend/app/api/analytics.py`
- `backend/app/app_factory.py`
- `backend/app/services/bigquery_client.py`
- `backend/app/services/dashboard_postgres.py`
- `backend/requirements.txt`
- `backend/tests/test_local_data_migration.py`
- `backend/tests/test_organisation_dashboard.py`
- `frontend/scripts/eventlogs_closed_loop_proof.mjs`
- `frontend/scripts/eventlogs_portrait_proof.mjs`
- `frontend/scripts/organisation-dashboard-browser.mjs`
- `frontend/src/app/routes.tsx`
- `frontend/src/components/VRMLayout.tsx`
- `frontend/src/features/alarms/AlarmLogsPage.tsx`
- `frontend/src/features/alarms/hooks/useAlarmLogs.ts`
- `frontend/src/features/alarms/types.ts`
- `frontend/src/features/devices/DeviceListPage.tsx`
- `frontend/src/features/events/EventLogsPage.tsx`
- `frontend/src/features/events/components/DevicesMultiSelect.tsx`
- `frontend/src/features/events/hooks/useEventLogsQuery.ts`
- `frontend/src/features/events/utils/eventTypes.ts`
- `frontend/src/features/organisation-dashboard/DemoDashboardRoute.tsx`
- `frontend/src/features/organisation-dashboard/OrganisationDashboardProvider.tsx`
- `frontend/src/features/reports/ReportsPage.tsx`
- `frontend/src/features/reports/engine/ReportsEngine.ts`

### Removed

- `backend/app/local_logs.py`
- `backend/app/services/event_devices.py`
- `frontend/src/features/alarms/demoAlarmLogs.ts`
- `frontend/src/features/alarms/transport/fetchAlarmLogs.ts`
- `frontend/src/features/alarms/transport/fetchAlarmUsers.ts`
- `frontend/src/features/devices/demoDevices.ts`
- `frontend/src/features/devices/demoRuntimeEvents.ts`
- `frontend/src/features/devices/hooks/useDeviceList.ts`
- `frontend/src/features/devices/transport/fetchDataSourceCsv.ts`
- `frontend/src/features/devices/transport/fetchDeviceDataSources.ts`
- `frontend/src/features/devices/transport/fetchDeviceList.ts`
- `frontend/src/features/devices/transport/fetchDeviceUsers.ts`
- `frontend/src/features/events/runtimeProof.ts`
- `frontend/src/features/events/runtimeSyntheticContract.json`
- `frontend/src/features/events/transport/searchEvents.ts`
- `frontend/src/features/events/transport/syntheticEventLogs.ts`
- `frontend/src/features/events/utils/eventDevices.ts`
