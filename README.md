# camOS Business Intelligence Dashboard

camOS delivers preset-driven CCTV analytics built on a shared ChartSpec/ChartResult
contract. The system pairs a manifest-driven dashboard with an operator-facing
analytics workspace so teams can view KPIs, explore vetted presets, and pin the
results they care about.

## What this project does today

- FastAPI backend authenticates users, executes ChartSpecs against BigQuery, and serves dashboard manifest APIs.
- ChartSpec/ChartResult schemas live in `shared/analytics` with mirrored TypeScript types so backend and frontend stay aligned.
- Analytics engine compiles presets into parameterised SQL, normalises results, validates payloads, and caches responses.
- Dashboard V2 ships with a seeded manifest (KPI band + Live Flow) plus pin/unpin flows that hydrate inline specs for the UI.
- Analytics workspace exposes a curated preset catalogue with guarded overrides, defaults to live `/api/analytics/run`, and only uses fixtures when explicitly toggled for development.
- A documented data contract (`docs/analytics/data_contract.md`) and `backend/app/analytics/data_contract.py` ensure every metric, dimension, and time range resolves through the same BigQuery query builder.

## Architecture Overview

- **Backend:** FastAPI application (`backend/fastapi_app.py`) with modular analytics packages for compilation, caching, and manifest management.
- **Data:** Google BigQuery is the system of record; per-organisation tables are resolved through the table router and queried via the official client.
- **Frontend:** React + TypeScript SPA built with Create React App. Analytics workspace lives under `frontend/src/analytics/v2`, dashboard under `frontend/src/dashboard/v2`.
- **Shared contracts:** `shared/analytics` defines JSON Schemas, fixtures, and golden ChartResults that power regression tests on both sides.
- **Deployment:** Dockerfile performs a multi-stage build (React static assets baked into the Python image) and targets Cloud Run-style environments.

## Development Plan

See [docs/dev_plan.md](docs/dev_plan.md) for the truthful summary of completed work
and the placeholder roadmap. That document is the single source of truth for the
project phases.

## Key Product Surfaces

### Analytics workspace (`/analytics`)
- Preset rail is sourced from `frontend/src/analytics/v2/presets/presetCatalogue.ts`.
- Chart canvas renders a single `ChartResult` via `ChartRenderer`, including loading, empty, and error states.
- Inspector controls (time chips, splits, measures) mutate presets only when the transport is set to `live`; fixture mode disables unsupported overrides.
- Pins route through `pinDashboardWidget`, mirroring backend specs on the dashboard when live transport is available.

### Dashboard V2 (`/dashboard`)
- Fetches manifests from `GET /api/dashboards/<dashboard_id>?orgId=<org>` (default `dashboard-default` + `client0`).
- Default manifest provides six KPI widgets and the Live Flow chart so `/dashboard` is populated on first run.
- Widgets render through shared `Card` + `ChartRenderer` primitives with validation-driven error messaging.
- Operators can unpin non-locked widgets; new pins originate from the analytics workspace.

## APIs & Fixtures

- `ChartSpec`/`ChartResult` schemas live in `shared/analytics/schemas` (mirrored in `frontend/src/analytics/schemas/charting.ts`).
- Golden `ChartResult` fixtures live in `frontend/src/analytics/examples/` (frontend) and `shared/analytics/examples/` (shared/backend tests).
- Dashboard manifest endpoints:
  - `GET /api/dashboards/{dashboard_id}?orgId=client0`
  - `POST /api/dashboards/{dashboard_id}/widgets?orgId=client0`
  - `DELETE /api/dashboards/{dashboard_id}/widgets/{widget_id}?orgId=client0`
- SPA fallback routes are registered after manifest/analytics APIs so frontend routes no longer receive erroneous 404s.

## Local Development

### Prerequisites

- Python 3.11+
- Node.js 20+
- npm 9+
- Google Cloud service account (`sa.json`) with access to the CCTV BigQuery datasets

### Backend

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
python3 -m uvicorn backend.fastapi_app:app --host 0.0.0.0 --port 8000 --reload
```

Set these environment variables if you need live data:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json
export BQ_PROJECT=nigzsu
export BQ_DATASET=client_events
export BQ_LOCATION=EU
```

### Frontend

```bash
cd frontend
npm install
REACT_APP_API_URL=http://localhost:8000 npm start
```

- Live transport (default): `REACT_APP_API_URL=http://localhost:8000 npm start` hits `/api/analytics/run` for every preset.
- Fixture transport (dev/QA only): set `REACT_APP_ANALYTICS_V2_TRANSPORT=fixtures` before `npm start` to replay the curated JSON fixtures.
- Dashboard + analytics v2 routes are already the defaults; no extra flags are required.

### Pinning round-trip

1. Run both servers.
2. Visit `http://localhost:5000/analytics`, pick a preset, and hit **Pin to dashboard**.
3. Visit `http://localhost:5000/dashboard`; the pinned widget appears inside the manifest returned from `GET /api/dashboards/dashboard-default?orgId=client0`.

## Testing & QA

All four commands must pass before shipping:

```bash
pytest
npm --prefix frontend run lint
CI=true npm --prefix frontend test
npm --prefix frontend run build
```

Manual smoke checklist (live transport by default):

- `/dashboard` loads without errors and shows KPI widgets + Live Flow; pinning from the analytics workspace appears after a refresh.
- `/analytics` presets render live data:
  - Live Flow clearly changes span and values between 6h, 24h, and 7d.
  - Average Dwell by Camera updates dwell minutes between 7d and 30d.
  - Retention Heatmap adds/removes cohort columns between 12w and 24w while passing validation.
- For fixture-only demos, set `REACT_APP_ANALYTICS_V2_TRANSPORT=fixtures`; the inspector chips will surface the locked-state warning.

## Deployment Notes

- Dockerfile builds both frontend and backend. Run `docker build -t camos-analytics .` then `docker run -p 8080:8080 camos-analytics` for a local container.
- Cloud Run deployment requires the same BigQuery env vars plus `GOOGLE_APPLICATION_CREDENTIALS` (or workload identity) for the analytics engine.
- Static assets are mounted under `/static`, `/dashboard` and `/analytics` are handled by the SPA fallback, and manifest/analytics API routes are explicitly registered before the fallback to avoid the previous 404s.
- Default organisation for demos remains `client0`; adjust `backend/data/users.json` if you need more accounts.
