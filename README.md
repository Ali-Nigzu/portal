# camOS Business Intelligence Dashboard

A preset-first analytics experience for CCTV-derived metrics. The system is now driven entirely by `ChartSpec` → BigQuery → `ChartResult` contracts and exposes two production surfaces:

* `/analytics` – a curated workspace where operators run vetted presets one at a time, tweak a guarded set of controls, and pin interesting results to the dashboard.
* `/dashboard` – a manifest-driven KPI + chart layout that reads the same backend specs and renders via the shared `ChartRenderer` primitives.

There are no hidden "v2" routes. Everything described below is what ships in production today.

## Current Product Surfaces

### Analytics workspace (`/analytics`)
* Left rail lists presets from `frontend/src/analytics/v2/presets/presetCatalogue.ts`.
* Canvas renders a single `ChartResult` through `ChartRenderer` and surfaces validation/empty states.
* Inspector controls:
  * Time-range chips, split toggle, and metric selector mutate the preset spec **only when the transport is `live`**.
  * When transport = `fixtures` (the default for local demo), those chips are visibly disabled and explain that live data is required for overrides. This avoids pretending that fixture data responds to the controls.
* Pins go through `pinDashboardWidget` so the same spec appears on `/dashboard`.

### Dashboard V2 (`/dashboard`)
* Loads a manifest from `GET /api/dashboards/<dashboard_id>?orgId=<org>` (default `dashboard-default` + `client0`).
* Default manifest always returns six KPI widgets and the Live Flow chart so `/dashboard` is never empty on a fresh install.
* Widgets are rendered through the shared `Card` + `ChartRenderer` stack; validation errors appear in-card.
* Users can unpin non-locked widgets; new pins originate from the analytics workspace.

## Architecture snapshot

| Layer | Details |
| --- | --- |
| Frontend | React + TypeScript SPA. Shared `ChartRenderer` lives under `frontend/src/analytics/components/ChartRenderer`. Workspace + dashboard V2 code sits under `frontend/src/analytics/v2` and `frontend/src/dashboard/v2`. |
| Backend | FastAPI app (`backend/fastapi_app.py`). `/analytics/run` compiles `ChartSpec` objects via `backend/app/analytics/*`, runs BigQuery queries, normalises into `ChartResult`, and caches responses. Dashboard manifests live in `backend/app/analytics/dashboard_catalogue.py` with an in-memory repository that seeds `client0`. |
| Data | Google BigQuery per-organisation tables accessed via the service account in `sa.json`. Contracts and fixtures are stored under `shared/analytics`. |

## APIs & Fixtures

* `ChartSpec`/`ChartResult` schemas live in `shared/analytics/schemas` (mirrored in `frontend/src/analytics/schemas/charting.ts`).
* Golden `ChartResult` fixtures live in `frontend/src/analytics/examples/` (frontend) and `shared/analytics/examples/` (shared/backend tests).
* Dashboard manifest endpoints:
  * `GET /api/dashboards/{dashboard_id}?orgId=client0`
  * `POST /api/dashboards/{dashboard_id}/widgets?orgId=client0`
  * `DELETE /api/dashboards/{dashboard_id}/widgets/{widget_id}?orgId=client0`
* The catch-all SPA route now sits **after** these manifest endpoints, so the frontend never receives the old `API or static route not found` 404 during normal operation.

## Local Development

### Prerequisites

* Python 3.11+
* Node.js 20+
* npm 9+
* Google Cloud service account (`sa.json`) with access to the CCTV BigQuery datasets

### Backend

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
python3 -m uvicorn backend.fastapi_app:app --host 0.0.0.0 --port 8000 --reload
```

Set these environment variables if you need live data:

```
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

* Fixture mode (default): do nothing and the workspace will load curated JSON responses.
* Live mode: `REACT_APP_ANALYTICS_V2_TRANSPORT=live REACT_APP_API_URL=http://localhost:8000 npm start` to hit `/analytics/run`.
* Dashboard + analytics v2 routes are already the defaults; no extra flags are required.

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

Manual smoke checklist (using fixture mode unless otherwise noted):

* `/dashboard` loads without errors and shows KPI widgets + Live Flow.
* `/analytics` presets render:
  * Live Flow chart with fixture data.
  * Average Dwell by Camera chart.
  * Retention Heatmap heatmap (no validation banner).
* Switch `REACT_APP_ANALYTICS_V2_TRANSPORT=live` to exercise inspector controls; switch back to fixtures to confirm the controls visibly lock.

## Deployment Notes

* Dockerfile builds both frontend and backend. Run `docker build -t camos-analytics .` then `docker run -p 8080:8080 camos-analytics` for a local container.
* Cloud Run deployment requires the same BigQuery env vars plus `GOOGLE_APPLICATION_CREDENTIALS` (or workload identity) for the analytics engine.
* Static assets are mounted under `/static`, `/dashboard` and `/analytics` are handled by the SPA fallback, and manifest/analytics API routes are explicitly registered before the fallback to avoid the previous 404s.
* Default organisation for demos remains `client0`; adjust `backend/data/users.json` if you need more accounts.
