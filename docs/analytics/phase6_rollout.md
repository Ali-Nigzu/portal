# Phase 6 Rollout Governance

This document describes the routing governance that enables the irreversible promotion of the Analytics Workspace and Dashboard V2 surfaces.

## Environment Variables

| Variable | Values | Default (non-production) | Production Behaviour | Purpose |
| --- | --- | --- | --- | --- |
| `REACT_APP_ANALYTICS_EXPERIENCE` | `legacy` \| `v2` | `v2` | Forced to `v2` | Selects which analytics surface is mounted at `/analytics`. |
| `REACT_APP_DASHBOARD_EXPERIENCE` | `legacy` \| `v2` | `v2` | Forced to `v2` | Selects which dashboard surface is mounted at `/dashboard`. |
| `REACT_APP_EXPOSE_ANALYTICS_V2` | `true` \| `false` | `true` | Ignored (always `true`) | Allows direct access to `/analytics/v2` when the default is `legacy`. |
| `REACT_APP_EXPOSE_ANALYTICS_LEGACY` | `true` \| `false` | `false` | Ignored (always `false`) | Allows `/analytics/legacy` while the V2 workspace is default in non-prod environments. |
| `REACT_APP_EXPOSE_DASHBOARD_V2` | `true` \| `false` | `true` | Ignored (always `true`) | Allows `/dashboard/v2` when the legacy dashboard is default in development environments. |
| `REACT_APP_EXPOSE_DASHBOARD_LEGACY` | `true` \| `false` | `false` | Ignored (always `false`) | Allows `/dashboard/legacy` for manual QA after the V2 dashboard is default. |

> **Note**: Legacy routes are automatically disabled in production regardless of the variables above. Production always mounts the V2 experiences at `/analytics` and `/dashboard`.

## Common Configurations

### Phase 6 default configuration (development & staging)

```
REACT_APP_ENVIRONMENT=development
# No experience overrides required – defaults resolve to V2
```

* `/analytics` → Analytics Workspace V2
* `/dashboard` → Dashboard V2
* Legacy suffix routes hidden unless explicitly re-enabled (see QA combinations below)

### Phase 6 rollout configuration (production)

```
REACT_APP_ENVIRONMENT=production
# Experience variables are ignored and forced to v2 in production
```

* `/analytics` → Analytics Workspace V2
* `/dashboard` → Dashboard V2
* Legacy routes are not exposed

### Legacy regression QA (non-production only)

```
REACT_APP_ENVIRONMENT=development
REACT_APP_ANALYTICS_EXPERIENCE=v2
REACT_APP_DASHBOARD_EXPERIENCE=v2
REACT_APP_EXPOSE_ANALYTICS_LEGACY=true
REACT_APP_EXPOSE_DASHBOARD_LEGACY=true
```

* `/analytics` → Analytics Workspace V2
* `/analytics/legacy` available for manual regression testing only
* `/dashboard` → Dashboard V2
* `/dashboard/legacy` available for manual regression testing only

### Forced legacy comparison (non-production emergency QA)

```
REACT_APP_ENVIRONMENT=development
REACT_APP_ANALYTICS_EXPERIENCE=legacy
REACT_APP_DASHBOARD_EXPERIENCE=legacy
REACT_APP_EXPOSE_ANALYTICS_V2=true
REACT_APP_EXPOSE_DASHBOARD_V2=true
```

* `/analytics` → legacy workspace
* `/analytics/v2` → Analytics Workspace V2 for side-by-side checks
* `/dashboard` → legacy dashboard
* `/dashboard/v2` → Dashboard V2 for side-by-side checks

## Smoke Checks

After changing any of the variables above:

1. Run `npm --prefix frontend start` and authenticate into the portal.
2. Navigate to `/analytics` and `/dashboard` to confirm the default experiences match the configuration.
3. Attempt to access the legacy/v2 suffix routes to verify they are available **only** when explicitly exposed in non-production environments.
4. Run `CI=true npm --prefix frontend test -- experienceConfig` to verify the experience gating tests.

## Manifest API Guarantees

* Every manifest write passes schema validation (widget shape, layout grid columns = 12, KPI band integrity, unique widget IDs).
* Pinning the same widget ID twice is idempotent – the backend returns the unchanged manifest with a 200.
* Unpinning a missing widget is a no-op that returns the current manifest.
* Locked widgets (`locked: true`) cannot be removed; the API responds with `400` and `{ "error": "manifest_validation", ... }`.
* Errors always return structured payloads from FastAPI (`manifest_not_found` or `manifest_validation`).
* The in-memory repository lives behind `ManifestRepository`; swap the implementation to persist manifests without touching the API surface.

## Phase 6 QA Matrix

### Analytics Workspace

1. `npm --prefix frontend start` → `/analytics` auto-loads the first preset via fixtures (or `/analytics/run` in live mode).
2. Toggle measure chips and time controls; confirm reruns succeed and ChartRenderer issues surface in-line.
3. Pin a chart to the dashboard and watch for the "Pinned to dashboard" badge.
4. Inspect console logs for `[analytics:v2] run:*` entries – errors should include category + message.
5. Validate error handling by forcing the transport mock to reject (`MockTransportError` in tests) → `analytics-chart-error` card appears.

### Dashboard V2

1. `/dashboard` loads KPI band + Live Flow without manual refresh.
2. Change time range selector; widgets re-run with updated options and status chips update.
3. Pin from `/analytics` and confirm the widget appears in the grid without reloading the page.
4. Unpin via tile/card buttons; manifest updates instantly with no duplicates.
5. Force widget loader failures (e.g., disconnect network or mock rejection) – error banners display and console logs `[dashboard.widgets]` errors.

### Manifest API

1. `pytest backend/tests/test_dashboard_manifest.py` – verifies schema validation, idempotent pin/unpin, and rollback on error.
2. Manual curl: `POST /api/dashboards/dashboard-default/widgets` with malformed payload returns `400` + structured error.
3. Duplicate pin call returns current manifest unchanged.
4. Locked widget removal returns `400` + validation error while preserving manifest state.

### Logging & Observability

* Frontend console namespaces:
  * `[analytics:v2]` – analytics run start/success/error.
  * `[dashboard.manifest]` – manifest fetch/pin/unpin start/success/failure.
  * `[dashboard.widgets]` – widget load lifecycle + validation issues.
* Error boundaries render fallback UI with `error-boundary` class and log `[ui.analytics-workspace]` or `[ui.dashboard-v2]` events.
* Abort/timeout behaviour is handled via `createAbortSignal`; inspect `init.signal.aborted` in devtools when simulating slow networks.
