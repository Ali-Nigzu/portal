# Development Plan

## 1. Current Status (High Level)

- FastAPI backend serves authentication flows, analytics execution, and dashboard manifest APIs backed by BigQuery.
- ChartSpec/ChartResult contracts live in `shared/analytics` and are shared with the frontend via generated TypeScript types.
- Analytics engine compiles ChartSpecs into parameterised SQL, executes queries through the BigQuery client, normalises results, and caches responses.
- Dashboard catalogue seeds KPI widgets and the Live Flow chart; manifests can be fetched, pinned to, and mutated via the API with fixture fallbacks for demos.
- React frontend exposes the analytics workspace and dashboard surfaces, both powered by the shared `ChartRenderer` and defaulting to the live BigQuery transport (fixtures only appear when explicitly requested for dev/QA).

## 2. Completed Phases (Reality, not original plan)

### Phase 1 – Core Backend Foundations

- Established the FastAPI application, configuration helpers, and authentication utilities in `backend/app`.
- Added JSON-backed storage for users, devices, alarms, and interest registrations to support the existing routes.
- Introduced health checks and startup validation for the analytics dependencies.

### Phase 2 – Analytics Schemas & BigQuery Engine

- Defined canonical ChartSpec/ChartResult schemas plus shared fixtures under `shared/analytics` with validation tests in `backend/tests`.
- Implemented the Spec compiler, table router, hashing, and cache abstractions that drive the analytics engine in `backend/app/analytics`.
- Wired the BigQuery client to execute compiled SQL and normalise payloads before returning validated ChartResults.

### Phase 3 – Manifest-Driven Dashboard API

- Authored the dashboard specification catalogue and default widget layout (`backend/app/analytics/dashboard_catalogue.py`).
- Exposed GET/POST/DELETE manifest endpoints via `backend/fastapi_app.py`, including in-memory persistence and fixture-aware responses.
- Documented the manifest contracts through the shared Pydantic models in `backend/app/models.py`.

### Phase 4 – Analytics Workspace Presets

- Delivered the preset-first analytics workspace in `frontend/src/analytics/v2` with guarded overrides, transport abstraction, and ChartRenderer integration.
- Provided fixture and live transport modes plus pin-to-dashboard flows that reuse the backend manifest APIs.
- Added Jest coverage and fixture examples that keep workspace behaviour aligned with backend contracts.

### Phase 5 – Dashboard V2 & Pinning (partial)

- Frontend dashboard (`frontend/src/dashboard/v2`) renders KPI and chart widgets from manifest responses and honours layout metadata.
- Pin/unpin flows connect the analytics workspace to the manifest API; locked widgets and default layouts ensure `/dashboard` is populated by default.
- Outstanding: manifests persist in memory only and durable storage is deferred.

### Phase 7 – Live Analytics Surfaces

- Defaulted the analytics workspace transport to live BigQuery execution with fixture mode only available via an explicit developer flag.
- Ensured inspector overrides (time ranges, splits, measures) rebuild ChartSpecs, trigger new runs, and surface spec hash changes for every preset.
- Verified `/dashboard` consumes manifest endpoints, respects pin/unpin flows from the workspace, and remains aligned with the analytics presets after refreshes.

### Phase 8 – Data Contract + BigQuery Alignment

- Authored `docs/analytics/data_contract.md` capturing canonical metrics, dimensions, and time range rules for every client dataset.
- Implemented `backend/app/analytics/data_contract.py` with enumerations, query planners, and QueryContext validation.
- Refactored `DataProcessor` and analytics endpoints to build SQL exclusively through the contract, covering demographics, dwell, and KPI stats.
- Updated presets/fixtures to use canonical column identifiers and explicit fixture-only site/camera labels.

## 3. Future Phases (Placeholders)

### Phase 8–20 – To Be Defined

- Detailed scope for Phases 8–20 will be provided separately.
- Do not infer or invent future features from previous documentation.
- This file records completed work and placeholders only.
