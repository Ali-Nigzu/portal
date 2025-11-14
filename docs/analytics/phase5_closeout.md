# Phase 5 Closeout – Dashboard Refactor & Pinning

Phase 5 ships the manifest-driven dashboard v2 experience behind a feature flag. The frontend now renders KPI tiles and chart cards exclusively through `ChartRenderer`, while the backend serves a catalogue of dashboard `ChartSpec`s, a per-organisation manifest store, and pin/unpin APIs. This document captures the final state so Phase 6 can focus on rollout and polish without rediscovering context.

## Delivered Surface Area

* **Backend catalogue + manifest service** – `backend/app/analytics/dashboard_catalogue.py` seeds KPI + Live Flow specs, validates them against the frozen contracts, and persists organisation manifests (deep-cloned from templates).
* **API endpoints** – `backend/fastapi_app.py` exposes `GET /api/dashboards/:id`, `POST /api/dashboards/:id/widgets`, and `DELETE /api/dashboards/:id/widgets/:widgetId`, all returning `DashboardManifest` Pydantic models.
* **Fixture + golden data** – Shared fixtures under `shared/analytics/examples/` mirror the backend catalogue; frontend fixtures in `frontend/src/analytics/examples/` power Storybook and tests.
* **Dashboard V2 frontend** – `frontend/src/dashboard/v2/pages/DashboardV2Page.tsx` loads manifests, resolves org IDs, clones specs, and renders everything via `<Card>` + `<ChartRenderer>` and KPI primitives. Transport helpers live in `frontend/src/dashboard/v2/transport/`.
* **Pinning plumbing** – Analytics workspace uses `pinDashboardWidget` / `unpinDashboardWidget` helpers for optimistic manifest updates, with deterministically cloned specs and fixture fallbacks.
* **QA assets** – Jest suites and Storybook stories exercise coverage states, Live Flow fallbacks, manifest mutations, and feature-flag isolation.

## Manifest Contract

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
      "inlineSpec": { /* hydrated automatically when manifest is served */ }
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
    "kpiBand": [
      "kpi-activity-today",
      "kpi-entrances-today",
      "kpi-exits-today",
      "kpi-live-occupancy",
      "kpi-avg-dwell",
      "kpi-freshness"
    ],
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

**Important rules**

* `locked: true` widgets cannot be removed; custom pins default to `locked: false`.
* `inlineSpec` is injected server-side on GET using the immutable catalogue entry. Clients must never mutate the returned spec in place.
* Layout metadata is manifest-only. Widgets outside `layout.kpiBand` must have a grid placement (auto-generated on pin).
* Time controls drive spec overrides; options define the only allowed durations/buckets.

## API Surface

| Endpoint | Method | Query Params | Body | Behaviour |
| --- | --- | --- | --- | --- |
| `/api/dashboards/{dashboardId}` | GET | `orgId` (required) | – | Returns manifest with hydrated inline specs; 404 on unknown dashboard. |
| `/api/dashboards/{dashboardId}/widgets` | POST | `orgId` | `{ "widget": DashboardWidget, "position"?, "targetBand"? }` | Validates widget (ensures spec provided), appends to manifest, infers placement, returns updated manifest. 400 on validation errors, 404 on missing manifest. |
| `/api/dashboards/{dashboardId}/widgets/{widgetId}` | DELETE | `orgId` | – | Removes unlocked widget, cleans layout references, returns updated manifest. Locked widgets throw 400. |

`DashboardWidget` accepts either `chartSpecId` (resolved by catalogue) or `inlineSpec` (validated). Widgets may include `fixtureId` so fixtures can satisfy spec requests during QA.

## KPI Catalogue

| KPI | Spec ID | Measure | Window |
| --- | --- | --- | --- |
| Activity Today | `dashboard.kpi.activity_today` | `activity_total` count | Midnight → now (hour buckets) |
| Entrances Today | `dashboard.kpi.entrances_today` | `entrances` count (event_type 1) | Midnight → now |
| Exits Today | `dashboard.kpi.exits_today` | `exits` count (event_type 0) | Midnight → now |
| Live Occupancy | `dashboard.kpi.live_occupancy` | `occupancy_recursion` | Rolling 60 min, 5-min buckets |
| Avg Dwell Today | `dashboard.kpi.avg_dwell_today` | `dwell_mean` | Midnight → now |
| Freshness Status | `dashboard.kpi.freshness_status` | `freshness` metric (value in minutes) | Rolling 120 min |

Live Flow uses spec `dashboard.live_flow` (occupancy, entrances, exits, throughput) with canonical `5_MIN` buckets, surge metadata, hover sync, and dual-axis display hints. All specs live in `DASHBOARD_SPEC_CATALOGUE`.

## Grid Layout Metadata

* 12-column CSS grid; each placement is `{ x, y, w, h }` in grid units with `gridAutoRows = 96px`.
* KPI band order is authoritative; KPIs not listed are treated as standard chart widgets.
* Auto-placement fills new chart widgets sequentially in full-width rows unless `widget.layout.grid` overrides placement.

## Spec Overrides & Cloning

* `buildWidgetSpec` clones each widget’s `inlineSpec` (deep JSON clone) before applying overrides.
* Overrides supported in Phase 5: `timeWindow.from`, `timeWindow.to`, `timeWindow.bucket`, matching `durationMinutes` and optional `bucket` from the selected manifest option; timezone propagated when supplied.
* Timestamp dimension buckets are synchronised with the active option. No other fields are mutated.
* AbortController cancels inflight widget fetches when manifests/time ranges change to avoid stale updates.

## Transport Behaviour

* `loadWidgetResult` chooses between fixtures and live `/analytics/run` depending on `ANALYTICS_V2_TRANSPORT` and widget `fixtureId`.
* All responses run through `validateChartResult`; violations surface as errors.
* Org resolution uses `determineOrgId(credentials)` to scope manifest + analytics calls consistently.
* Pin/unpin helpers optimistically refresh manifests; failures surface banner errors.

## Feature Flags & Modes

* Frontend: `REACT_APP_FEATURE_DASHBOARD_V2` gates the entire dashboard route (`frontend/src/App.tsx`).
* Transport mode: `REACT_APP_ANALYTICS_V2_TRANSPORT` toggles fixtures vs live analytics for both workspace and dashboard.
* Backend currently persists manifests in-memory (`_MANIFEST_STORE`); swapping to durable storage is Phase 6+ scope.

## Known Limitations / Phase 6 Targets

* Memory-backed manifest store (no DB). Persistence resets on process restart.
* Feature flag keeps dashboard v2 hidden; legacy dashboard still ships in parallel.
* Spec catalogue limited to default KPI + Live Flow plus pinned widgets; richer custom catalogues are future work.
* Styling focused on desktop/tablet breakpoints; mobile polish remains for Phase 6.
* No realtime push/stream updates; manual refresh triggers re-run.

## Safe Removals in Phase 6

* Legacy dashboard route/components once V2 replaces them.
* Fixture-only chart mappings once live BigQuery coverage is validated (retain golden fixtures for tests).
* Feature flag toggles (`REACT_APP_FEATURE_DASHBOARD_V2`) after rollout sign-off.
* In-memory manifest store when durable persistence is introduced.

## Phase 6 Startup Checklist

1. Remove dashboard v2 feature flag and wire V2 as default route.
2. Point dashboard transport to live analytics by default (`REACT_APP_ANALYTICS_V2_TRANSPORT=live`).
3. Replace legacy dashboard entry point and delete obsolete metric helpers.
4. Migrate KPI tile styling/logic from legacy components, ensuring parity against backend fixtures.
5. Validate Live Flow parity using live data and tighten surge/coverage messaging.
6. Implement durable manifest persistence (database) and migrate existing in-memory state.
7. Audit responsiveness + accessibility across small breakpoints; finalise design polish.
8. Extend QA automation (backend + frontend) to cover live transport, regression snapshots, and smoke tests post-flag removal.
