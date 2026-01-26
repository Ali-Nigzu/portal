# Repo Structure Report (planning only)

Date: 2025-09-27

## Mandatory repo counts

- `git ls-files | wc -l` → **100**
- `git ls-files -z | xargs -0 wc -l | tail -n 1` → **22872 total**
- `git diff --stat` → **(empty)** (only the report file is new)

## Required validations (timings + output summary)

> All timings captured with the shell `time` builtin.

- `npm --prefix frontend ci`
  - Result: **success**
  - Warnings: npm deprecations
  - Timing:
    - real 0m12.379s
    - user 0m13.622s
    - sys 0m11.093s

- `npm --prefix frontend run build`
  - Result: **success (warnings)**
  - Warnings: eslint `no-whitespace-before-property` across analytics + dashboard files
  - Timing:
    - real 0m34.296s
    - user 1m8.325s
    - sys 0m10.899s

- `python -c "import backend.fastapi_app"`
  - Result: **success (warnings)**
  - Warnings:
    - Pydantic v2 config key warning
    - google.api_core python version support warning
    - backend static assets warning (backend/frontend_build/static not found)

## Current Structure Map (what exists now)

### Top-level

- `backend/` → FastAPI app + data + requirements
- `frontend/` → React SPA (CRA)
- `docs/` → documentation artifacts
- `Dockerfile` → container build
- `pyproject.toml` → project metadata placeholder (no deps declared)

### Frontend

**Entrypoint + router chain**

- `frontend/src/index.tsx` → renders `App`
- `frontend/src/app/App.tsx` → sets up `BrowserRouter` + `GlobalControlsProvider`
- `frontend/src/app/routes.tsx` → defines live routes

**Live routes / pages**

- `/` → `LandingPage`
- `/login` → `LoginPage`
- `/dashboard` → `DashboardPage` → `features/dashboard/v2/pages/DashboardV2Page`
- `/event-logs` → `EventLogsPage`
- `/alarm-logs` → `AlarmLogsPage`
- `/device-list` → `DeviceListPage`
- `/reports` → `ReportsPage`
- `/analytics`, `/analytics/*` → `AnalyticsComingSoonPage`
- `/admin` → `AdminPage` (only for admin role)

**Feature folders**

- `frontend/src/features/dashboard/v2/` → dashboard v2 runtime (widgets, snapshot transforms)
- `frontend/src/analytics/` → chart rendering + schema/types used by dashboard v2
- `frontend/src/components/` → shared layout, UI building blocks
- `frontend/src/context/` → global controls provider
- `frontend/src/lib/` → shared helpers (org, view token, time windows)

### Backend

**Entrypoint**

- `backend/fastapi_app.py` defines the FastAPI app directly (no `app_factory` module present).

**SPA serving**

- Expects a built SPA at `backend/frontend_build/` and serves:
  - `/static/*` from `backend/frontend_build/static`
  - `/` and non-API paths from `backend/frontend_build/index.html`

**API surface (routes in `fastapi_app.py`)**

- Auth + access
  - `POST /api/login`
  - `POST /api/admin/create-view-token`
- Public marketing form
  - `POST /api/register-interest`
- Analytics + snapshot data
  - `GET /api/search-events`
  - `GET /api/snapshots/latest`
  - `GET /api/dashboards/{dashboard_id}`
  - `DELETE /api/dashboards/{dashboard_id}/widgets/{widget_id}`
- Admin data management
  - `GET/POST/PUT/DELETE /api/admin/users`
  - `GET/POST/PUT/DELETE /api/admin/data-sources/{client_id}`
  - `POST /api/admin/data-sources/{client_id}/{source_id}/set-active`
  - `GET /api/alarm-logs`
  - `POST/PUT/DELETE /api/admin/alarm-logs`
  - `GET /api/device-list`
  - `POST/PUT/DELETE /api/admin/device-list`

**Backend module layout**

- `backend/app/models.py` → Pydantic models for API requests/responses
- `backend/app/database.py` → JSON-backed storage helpers (users, alarm logs, device list)
- `backend/app/auth.py` → authentication + dependency injection
- `backend/app/analytics/*` → dashboard manifests + analytics schema/contracts
- `backend/app/snapshots.py` → snapshot payload access
- `backend/app/bigquery_client.py` + `data_processor.py` + `org_config.py` → BigQuery-backed analytics/search
- `backend/app/config.py` → filesystem paths + allowed origins
- `backend/app/view_tokens.py` → view-token issuance/validation

## Prove-Required Map (reachable-only)

> Method: trace entrypoints (`frontend/src/index.tsx`, `backend/fastapi_app.py`), then follow import chains and route usage. Components not referenced by these chains are excluded here and evaluated below.

| Component/Folder/File | Why it exists | How it’s reached (import chain or route/API) | Live UI surface it supports | Keep/Delete candidate |
| --- | --- | --- | --- | --- |
| `frontend/src/index.tsx` | SPA entrypoint | CRA bootstraps → `App` | All routes | Keep (required) |
| `frontend/src/app/App.tsx` | Router + global provider | `index.tsx` → `App` | All routes | Keep |
| `frontend/src/app/routes.tsx` | Route definitions | `App` → `AppRoutes` | Landing/login/dashboard/analytics/admin, etc. | Keep |
| `frontend/src/components/VRMLayout.tsx` | Shell layout + nav | `routes.tsx` wraps protected pages | All authenticated pages | Keep |
| `frontend/src/pages/LandingPage.tsx` | Marketing entry | `/` route | Landing page + register interest form | Keep |
| `frontend/src/pages/LoginPage.tsx` | Login UX | `/login` route | Login | Keep |
| `frontend/src/pages/DashboardPage.tsx` | Dashboard entry | `/dashboard` route | Dashboard UI | Keep |
| `frontend/src/features/dashboard/v2/pages/DashboardV2Page.tsx` | Actual dashboard runtime | `DashboardPage` → `DashboardV2Page` | Dashboard UI | Keep |
| `frontend/src/pages/EventLogsPage.tsx` | Event logs UI | `/event-logs` route | Event logs | Keep |
| `frontend/src/pages/AlarmLogsPage.tsx` | Alarm logs UI | `/alarm-logs` route | Alarm logs | Keep |
| `frontend/src/pages/DeviceListPage.tsx` | Device list UI | `/device-list` route | Device list | Keep |
| `frontend/src/pages/ReportsPage.tsx` | Report generator | `/reports` route | Reports | Keep |
| `frontend/src/pages/AnalyticsComingSoonPage.tsx` | Placeholder analytics | `/analytics*` routes | Analytics placeholder | Keep (until replaced) |
| `frontend/src/pages/AdminPage.tsx` | Admin console | `/admin` route | Admin-only UI | Keep |
| `backend/fastapi_app.py` | FastAPI app + routing + SPA serving | `python -m` / uvicorn entry | API + SPA hosting | Keep |
| `backend/app/models.py` | Request/response models | imported by `fastapi_app.py` | API schema | Keep |
| `backend/app/database.py` | JSON persistence | imported by `fastapi_app.py` | Admin + login flows | Keep |
| `backend/app/auth.py` | Authentication | imported by `fastapi_app.py` | Auth gating | Keep |
| `backend/app/analytics/dashboard_catalogue.py` | Dashboard manifest | imported by `fastapi_app.py` | Dashboard API | Keep |
| `backend/app/analytics/data_contract.py` | Analytics query contract | imported by `fastapi_app.py` | `/api/search-events` | Keep |
| `backend/app/analytics/org_config.py` | Org + BigQuery config | imported by `fastapi_app.py` | `/api/search-events` | Keep |
| `backend/app/bigquery_client.py` | BigQuery client | imported by `fastapi_app.py` | `/api/search-events` | Keep |
| `backend/app/snapshots.py` | Snapshot payload | imported by `fastapi_app.py` | `/api/snapshots/latest` | Keep |
| `backend/app/view_tokens.py` | View token issuance | imported by `fastapi_app.py` | `/api/admin/create-view-token` | Keep |
| `backend/app/config.py` | File paths + CORS | imported by `fastapi_app.py` | All API + data paths | Keep |

## Dead/duplicate candidates (no deletions yet)

> Method: `rg` search for references + compare with prove-required map.

- `docs/loc-report.md` → no runtime imports or references discovered via `rg -n "loc-report" -S`. Candidate for archival if not required for docs history.
- `pyproject.toml` → no dependencies declared; backend installs likely use `backend/requirements.txt`. Candidate to consolidate if not used by tooling (verify tooling usage before removal).

## What is required for live UI + deployment

**Required for live UI**

- Frontend SPA runtime: `frontend/src/index.tsx` + `App` + `routes` + pages + dashboard features.
- Backend API: `backend/fastapi_app.py` + supporting modules in `backend/app/`.

**Required for deployment**

- SPA build output must exist at `backend/frontend_build/` with `index.html` and `static/` assets (FastAPI serves it).
- `backend/requirements.txt` (for python dependencies), `frontend/package.json` (for npm build).
- `Dockerfile` if containerized deployment is desired.

## Ideal Target Structure (lean + easy to understand)

> Goal: reflect current reachability and make responsibilities obvious.

### Frontend (recommended)

```
frontend/
  src/
    app/                # app shell + router
      App.tsx
      routes.tsx
    pages/              # route-level pages only
      LandingPage.tsx
      LoginPage.tsx
      DashboardPage.tsx
      ...
    features/           # domain features
      dashboard/
        v2/
          pages/
          components/
          utils/
    components/         # shared UI
    lib/                # shared utilities
    context/            # providers
    styles/             # global styling
    types/
```

### Backend (recommended)

```
backend/
  app/
    app_factory.py      # create_app() entry
    api/                # routers grouped by domain
      auth.py
      admin.py
      dashboards.py
      snapshots.py
    services/           # business logic
    models/             # pydantic models
    data/               # persistence adapters (JSON, BQ)
    spa/                # SPA serving helpers
  data/                 # runtime JSON storage (mounted volume)
  fastapi_app.py         # thin wrapper -> app_factory
```

## Lean CI/CD pipeline (fast + deterministic)

1. **Cache strategy**
   - Cache npm artifacts keyed by `frontend/package-lock.json`.
   - Cache Python deps keyed by `backend/requirements.txt`.

2. **Build ordering**
   - `npm --prefix frontend ci`
   - `npm --prefix frontend run build`
   - Place build output at `backend/frontend_build/` for deployment artifact.

3. **Deterministic installs**
   - Use `npm ci` (already deterministic via lockfile).
   - Use `pip install -r backend/requirements.txt` (optionally with pinned versions).

4. **Minimal checks required**
   - Import check: `python -c "import backend.fastapi_app"`
   - Frontend build: `npm --prefix frontend run build`
   - (Optional) API smoke: `uvicorn backend.fastapi_app:app --dry-run` or health-check endpoint.

## Ranked next PRs (small, safe steps)

1. **Add app factory** (`backend/app/app_factory.py`) and thin `fastapi_app.py` wrapper to make testing/config easier.
2. **Move SPA build output to a predictable location** (e.g., `backend/spa/`) with a config flag.
3. **Split FastAPI routes into routers** (`api/auth.py`, `api/admin.py`, `api/dashboards.py`, `api/snapshots.py`).
4. **Document deployment flow** in `docs/` including how to build + copy `frontend/build` to backend.
5. **Audit unused docs + tooling files** (e.g., `docs/loc-report.md`, `pyproject.toml`) and decide keep/remove.
