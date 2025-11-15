# Phase 5 Handover – Dashboard Refactor & Pinning (Closeout)

Phase 5 is complete. Dashboard V2 now renders entirely from backend manifests and analytics `ChartResult` payloads. This document captures everything the Phase 6 engineer needs to know about the delivered system, how to operate it locally, and where to extend it safely.

## 1. Directory & Module Map

| Area | Path | Notes |
| --- | --- | --- |
| Backend catalogue + manifest store | `backend/app/analytics/dashboard_catalogue.py` | Seeds KPI + Live Flow specs, validates them, persists org manifests (in-memory). |
| Dashboard API contracts | `backend/app/models.py` (`DashboardManifest`, `PinDashboardWidgetRequest`) | Pydantic models used by FastAPI responses/requests. |
| Dashboard API endpoints | `backend/fastapi_app.py` (`/api/dashboards/...`) | GET/POST/DELETE manifest + widget endpoints. |
| Shared fixtures | `shared/analytics/examples/` | Golden manifest + KPI/Live Flow results used across backend/frontend tests. |
| Frontend dashboard surface | `frontend/src/dashboard/v2/` | Page, transport helpers, utils, CSS grid, Storybook stories, Jest tests. |
| Analytics fixtures | `frontend/src/analytics/examples/` | Mirrors shared fixtures for fixture-mode rendering. |

## 2. Manifest Lifecycle

1. **Fetch** – Dashboard V2 calls `fetchDashboardManifest` (GET `/api/dashboards/{dashboardId}?orgId=...`). Backend deep-clones the stored manifest, hydrates `inlineSpec` for each widget from the catalogue, and returns it.
2. **Store** – `_MANIFEST_STORE` holds manifests per `(orgId, dashboardId)` key. Initial requests copy `_MANIFEST_TEMPLATES[dashboardId]`; defaults live in `DEFAULT_DASHBOARD_WIDGETS`, `DEFAULT_LAYOUT`, and `DEFAULT_TIME_CONTROLS`.
3. **Mutate** –
   * Pin: `pin_widget_to_manifest` validates widget (`inlineSpec` or `chartSpecId` required), sets `locked` default `false`, infers grid placement if needed, and appends it to manifest arrays.
   * Unpin: `remove_widget_from_manifest` rejects locked widgets, removes IDs from layout + placements, and returns updated manifest.
4. **Response** – `get_dashboard_manifest` always returns a fresh clone with hydrated specs, ensuring frontend never mutates the stored copy.

### Manifest Structure

```jsonc
{
  "id": "dashboard-default",
  "orgId": "client0",
  "widgets": [
    {
      "id": "kpi-activity-today",
      "title": "Activity Today",
      "kind": "kpi",
      "chartSpecId": "dashboard.kpi.activity_today",
      "fixtureId": "golden_dashboard_kpi_activity",
      "locked": true,
      "inlineSpec": { /* populated server-side */ }
    },
    {
      "id": "live-flow",
      "title": "Live Flow (Last 60 min)",
      "subtitle": "Live occupancy, entrances, exits and throughput",
      "kind": "chart",
      "chartSpecId": "dashboard.live_flow",
      "fixtureId": "golden_dashboard_live_flow",
      "locked": true
    }
  ],
  "layout": {
    "kpiBand": ["kpi-activity-today", "kpi-entrances-today", "kpi-exits-today", "kpi-live-occupancy", "kpi-avg-dwell", "kpi-freshness"],
    "grid": {
      "columns": 12,
      "placements": {
        "live-flow": { "x": 0, "y": 0, "w": 12, "h": 8 }
      }
    }
  },
  "timeControls": {
    "defaultTimeRangeId": "last_24_hours",
    "timezone": "UTC",
    "options": [
      { "id": "last_60_minutes", "label": "Last 60 minutes", "durationMinutes": 60, "bucket": "5_MIN" },
      { "id": "last_24_hours", "label": "Last 24 hours", "durationMinutes": 1440, "bucket": "HOUR" },
      { "id": "last_7_days", "label": "Last 7 days", "durationMinutes": 10080, "bucket": "DAY" }
    ]
  }
}
```

* `locked: true` prevents removal.
* `fixtureId` allows fixture mode to locate ChartResult JSON.
* All widgets have hydrated `inlineSpec` when delivered to the frontend.

## 3. Spec Cloning & Overrides

* `frontend/src/dashboard/v2/utils/buildWidgetSpec.ts` deep clones each widget’s `inlineSpec` (`JSON.parse(JSON.stringify)`).
* Time overrides apply only when a manifest time range option is selected: `timeWindow.from`, `timeWindow.to`, `timeWindow.bucket`, and optional timezone.
* Timestamp dimension bucket values are synchronised with the override; no other fields mutate.
* AbortControllers cancel inflight fetches whenever manifest/time-range/runNonce changes to prevent stale writes.

## 4. Dashboard V2 Rendering Flow

1. Resolve organisation via `determineOrgId(credentials)`.
2. Fetch manifest (`manifestLoader` prop defaults to `fetchDashboardManifest`).
3. Initialise widget state map and select time range (`defaultTimeRangeId` fallback).
4. Trigger widget fetches:
   * Build spec via `buildWidgetSpec`.
   * Choose fixtures vs live using `loadWidgetResult` (falls back to live if `fixtureId` missing even when fixtures requested).
   * Validate responses via `validateChartResult` before storing.
5. Render KPIs through `<ChartRenderer>` (height 168) inside KPI tiles; chart widgets render inside `<Card>` with `<ChartRenderer>` height 360.
6. Manifest changes (pin/unpin, reload) or time selection increments `runNonce`, re-fetching data with cancellation.

## 5. Transport Modes (Fixtures vs Live)

* Default is fixtures (`REACT_APP_ANALYTICS_V2_TRANSPORT` unset → `fixtures`).
* Set `REACT_APP_ANALYTICS_V2_TRANSPORT=live` to hit `/api/analytics/run` (legacy `/analytics/run` alias remains available).
* Dashboard transport shares the analytics workspace endpoint and schema; ensure backend `/api/analytics/run` stays spec-compatible.
* Feature flag `REACT_APP_FEATURE_DASHBOARD_V2` must be enabled to view the new dashboard route.

## 6. Pin / Unpin Testing

### Pinning from Analytics Workspace

1. Enable both `REACT_APP_FEATURE_ANALYTICS_V2` and `REACT_APP_FEATURE_DASHBOARD_V2`.
2. Load `/analytics/v2` (fixtures or live).
3. Use the existing “Pin to dashboard” CTA; it posts to `POST /api/dashboards/dashboard-default/widgets?orgId=...` with `{ widget, position, targetBand }`.
4. On success, dashboard manifest updates immediately; failure surfaces error toast and the dashboard remains unchanged.

### Removing Widgets

1. Visit Dashboard V2.
2. Unpin button appears on unlocked KPI tiles/cards.
3. Clicking Unpin triggers `DELETE /api/dashboards/dashboard-default/widgets/{widgetId}?orgId=...`.
4. Locked defaults never show the removal CTA; backend also enforces the guard (returns 400).

## 7. Testing & QA Commands

| Area | Command |
| --- | --- |
| Backend unit tests (includes manifest suite) | `pytest` or `pytest backend/tests/test_dashboard_manifest.py` |
| Frontend lint | `npm --prefix frontend run lint` |
| Frontend Jest (full) | `CI=true npm --prefix frontend test` |
| Targeted dashboard tests | `CI=true npm --prefix frontend test -- --runTestsByPath src/dashboard/v2/pages/DashboardV2Page.test.tsx` |
| Storybook (visual QA) | `npm --prefix frontend run storybook` (fixtures) or `npm --prefix frontend run build-storybook` for CI build |

## 8. Live vs Fixture Simulation

* Fixtures live under `frontend/src/analytics/examples/` and mirror backend golden outputs.
* Set `ANALYTICS_V2_TRANSPORT=fixtures` (default) to use them without hitting the backend analytics engine.
* For live mode:
  * Start backend (`uvicorn backend.fastapi_app:app --reload`).
  * Export `REACT_APP_ANALYTICS_V2_TRANSPORT=live` before running the frontend.
  * Ensure service account credentials/environment target the correct BigQuery dataset if live data is required.

## 9. Cautions & Follow-ups

* `_MANIFEST_STORE` is in-memory. Restarting the backend resets all custom pins. Phase 6 must introduce durable persistence.
* Dashboard and analytics workspace share `/api/analytics/run`; schema changes in Phase 6 must keep the contract stable.
* Keep `locked` semantics intact—Phase 6 should preserve default widgets until product approves changes.
* Mobile breakpoints are not fully polished; Phase 6 handles responsive refinement.
* Avoid mutating manifest `inlineSpec` in place on the frontend; always clone via `buildWidgetSpec`.

## 10. Phase 6 Quick Start

1. Read `docs/analytics/phase5_closeout.md` for the canonical manifest/spec contract.
2. Enable dashboard + analytics flags to explore current behaviour.
3. Run full test suite (`pytest`, `npm --prefix frontend run lint`, `CI=true npm --prefix frontend test`).
4. Use Storybook (`npm --prefix frontend run storybook`) to inspect KPI coverage, Live Flow empty states, and error stories.
5. Plan durable manifest storage + feature-flag removal using the checklist in the closeout doc.

For any changes, keep the guardrails: no frontend metric math, no ChartSpec/ChartResult schema modifications, and always reuse shared ChartRenderer primitives.
