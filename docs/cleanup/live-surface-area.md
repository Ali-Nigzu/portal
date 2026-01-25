# Live Surface Area

## Repo Snapshot
- Branch: main
- Commit: 4357c5ad6ef57ce49cd73e612d1cb51e2f2cec56
- Top-level directories: .github, .local, backend, docs, frontend, shared

## Frontend
- Framework: Create React App (react-scripts) with CRACO (craco start) and React Router v6.
- Entrypoint: frontend/src/index.tsx renders `<App />` via ReactDOM.createRoot.
- Routing: defined in frontend/src/App.tsx.

### Routing (path → component → auth/role guard → layout)
| Path | Component/page file | Guard / auth logic | Layout wrapper |
| --- | --- | --- | --- |
| `/` | frontend/src/pages/LandingPage.tsx | Public only when not logged in and no `view_token`; otherwise redirects to `/admin` or `/dashboard`. | None (outside VRMLayout). |
| `/login` | Inline Login component in frontend/src/App.tsx | Public only when not logged in and no `view_token`; otherwise redirects to `/admin` or `/dashboard`. | None (outside VRMLayout). |
| `/dashboard` | frontend/src/dashboard/v2/pages/DashboardV2Page.tsx | Requires login or `view_token`; if admin and not view token, redirects to `/admin`. | `VRMLayout` (frontend/src/components/VRMLayout.tsx) + `GlobalControlsProvider`. |
| `/event-logs` | frontend/src/pages/EventLogsPage.tsx | Requires login or `view_token`; if admin and not view token, redirects to `/admin`. | `VRMLayout` + `GlobalControlsProvider`. |
| `/alarm-logs` | frontend/src/pages/AlarmLogsPage.tsx | Requires login or `view_token`; if admin and not view token, redirects to `/admin`. | `VRMLayout` + `GlobalControlsProvider`. |
| `/device-list` | frontend/src/pages/DeviceListPage.tsx | Requires login or `view_token`; if admin and not view token, redirects to `/admin`. | `VRMLayout` + `GlobalControlsProvider`. |
| `/analytics`, `/analytics/v2`, `/analytics/legacy`, `/analytics/*` | frontend/src/pages/AnalyticsComingSoonPage.tsx | Requires login or `view_token`; if admin and not view token, redirects to `/admin`. | `VRMLayout` + `GlobalControlsProvider`. |
| `/reports` | frontend/src/pages/ReportsPage.tsx | Requires login or `view_token`; if admin and not view token, redirects to `/admin`. | `VRMLayout` + `GlobalControlsProvider`. |
| `/admin` | frontend/src/pages/AdminPage.tsx | Route only registered when `userRole === 'admin'` and user is logged in. | `VRMLayout` + `GlobalControlsProvider`. |
| `*` | N/A | Redirects to `/` if not logged in and no view token; otherwise redirects to `/admin` or `/dashboard`. | N/A |

### API calls (frontend → backend)
> Base URL is computed in frontend/src/config.ts (API_BASE_URL); in development the frontend proxy in frontend/package.json points to http://localhost:8000.

| Frontend file + function | Method | URL (exact or constructed) | Response usage | Backend endpoint mapping |
| --- | --- | --- | --- | --- |
| frontend/src/App.tsx `handleSubmit` (Login) | POST | `/api/login` | Sets credentials + org id on successful login. | `POST /api/login` (login) |
| frontend/src/pages/LandingPage.tsx `handleSubmit` | POST | `/api/register-interest` | Shows submit success or error. | `POST /api/register-interest` |
| frontend/src/pages/AnalyticsPage.tsx `fetchData` | GET | `${API_ENDPOINTS.CHART_DATA}?…` → `${API_BASE_URL}/api/chart-data?...` | Populates analytics dataset + intelligence. | `GET /api/chart-data` |
| frontend/src/pages/EventLogsPage.tsx `fetchEvents` | GET | `${API_ENDPOINTS.SEARCH_EVENTS}?…` (+ view_token/client_id) | Event logs table data and pagination. | `GET /api/search-events` |
| frontend/src/pages/EventLogsPage.tsx `handleExport` | GET | `${API_ENDPOINTS.SEARCH_EVENTS}?…` (+ view_token/client_id) | Builds CSV client-side from JSON response. | `GET /api/search-events` (not `/api/search-events/export`) |
| frontend/src/pages/AlarmLogsPage.tsx `fetchUsers` | GET | `${API_BASE_URL}/api/admin/users` | Loads users to detect admin + default client. | `GET /api/admin/users` |
| frontend/src/pages/AlarmLogsPage.tsx `fetchAlarmLogs` | GET | `${API_BASE_URL}/api/alarm-logs` (+ view_token/client_id) | Alarm list data. | `GET /api/alarm-logs` |
| frontend/src/pages/DeviceListPage.tsx `fetchUsers` | GET | `${API_BASE_URL}/api/admin/users` | Loads users to detect admin + default client. | `GET /api/admin/users` |
| frontend/src/pages/DeviceListPage.tsx `fetchDeviceList` | GET | `${API_BASE_URL}/api/device-list` (+ view_token/client_id) | Device list + data sources. | `GET /api/device-list` |
| frontend/src/pages/DeviceListPage.tsx `fetchDataSources` | GET | `${API_BASE_URL}/api/admin/data-sources/${clientToLoad}` | Loads data sources when admin fallback is needed. | `GET /api/admin/data-sources/{client_id}` |
| frontend/src/pages/DeviceListPage.tsx `handleDownloadDataSource` | GET | `sourceUrl` (from API response) | Downloads CSV from data source URL. | Unknown (URL provided by backend data) |
| frontend/src/pages/ReportsPage.tsx `fetchSnapshot` | GET | `${API_BASE_URL}/api/snapshots/latest?org=...` or `?viewToken=...` | Snapshot data used to build report PDFs. | `GET /api/snapshots/latest` |
| frontend/src/analytics/utils/exportChart.ts `triggerExport` | POST | `/api/analytics/export-placeholder` | Placeholder export request (warns if non-OK). | Unknown (no backend handler found) |
| frontend/src/analytics/v2/transport/runAnalytics.ts `runLiveQueryOnce` | POST | `${API_BASE_URL}/api/analytics/run` | Returns ChartResult for analytics v2 transport. | `POST /api/analytics/run` (currently returns 410) |
| frontend/src/dashboard/v2/transport/loadWidgetResult.ts `loadSnapshotPayload` | GET | `${API_BASE_URL}/api/snapshots/latest?...` | Snapshot payload for dashboard widgets. | `GET /api/snapshots/latest` |
| frontend/src/dashboard/v2/transport/loadWidgetResult.ts `runLiveQuery` | POST | `${API_BASE_URL}/api/analytics/run` | Live analytics queries for dashboard widgets. | `POST /api/analytics/run` (currently returns 410) |
| frontend/src/dashboard/v2/transport/fetchDashboardManifest.ts `fetchDashboardManifest` | GET | `${API_BASE_URL}/api/dashboards/{dashboardId}?orgId=...` or `?viewToken=...` | Dashboard manifest for v2. | `GET /api/dashboards/{dashboard_id}` |
| frontend/src/dashboard/v2/transport/mutateDashboardManifest.ts `pinDashboardWidget` | POST | `${API_BASE_URL}/api/dashboards/{dashboardId}/widgets?orgId=...` | Persists dashboard widget pin. | `POST /api/dashboards/{dashboard_id}/widgets` |
| frontend/src/dashboard/v2/transport/mutateDashboardManifest.ts `unpinDashboardWidget` | DELETE | `${API_BASE_URL}/api/dashboards/{dashboardId}/widgets/{widgetId}?orgId=...` | Removes dashboard widget pin. | `DELETE /api/dashboards/{dashboard_id}/widgets/{widget_id}` |
| frontend/src/pages/AdminPage.tsx `loadAdminData` | GET | `${API_BASE_URL}/api/admin/users` | Loads admin user list. | `GET /api/admin/users` |
| frontend/src/pages/AdminPage.tsx `loadAlarms` | GET | `${API_BASE_URL}/api/alarm-logs?client_id=...` | Loads alarms for selected client. | `GET /api/alarm-logs` |
| frontend/src/pages/AdminPage.tsx `loadDevices` | GET | `${API_BASE_URL}/api/device-list?client_id=...` | Loads devices for selected client. | `GET /api/device-list` |
| frontend/src/pages/AdminPage.tsx `loadDataSources` | GET | `${API_BASE_URL}/api/admin/data-sources/{clientId}` | Loads data sources for selected client. | `GET /api/admin/data-sources/{client_id}` |
| frontend/src/pages/AdminPage.tsx `handleAddUser` | POST | `${API_BASE_URL}/api/admin/users` | Creates user then reloads. | `POST /api/admin/users` |
| frontend/src/pages/AdminPage.tsx `handleEditUser` | PUT | `${API_BASE_URL}/api/admin/users/{username}` | Updates user then reloads. | `PUT /api/admin/users/{username}` |
| frontend/src/pages/AdminPage.tsx `handleDeleteUser` | DELETE | `${API_BASE_URL}/api/admin/users/{username}` | Deletes user then reloads. | `DELETE /api/admin/users/{username}` |
| frontend/src/pages/AdminPage.tsx `handleViewDashboard` | POST | `${API_BASE_URL}/api/admin/create-view-token` | Opens new tab with view token. | `POST /api/admin/create-view-token` |
| frontend/src/pages/AdminPage.tsx `handleAddAlarm` | POST | `${API_BASE_URL}/api/admin/alarm-logs` | Creates alarm then reloads. | `POST /api/admin/alarm-logs` |
| frontend/src/pages/AdminPage.tsx `handleEditAlarm` | PUT | `${API_BASE_URL}/api/admin/alarm-logs/{alarmId}` | Updates alarm then reloads. | `PUT /api/admin/alarm-logs/{alarm_id}` |
| frontend/src/pages/AdminPage.tsx `handleDeleteAlarm` | DELETE | `${API_BASE_URL}/api/admin/alarm-logs/{alarmId}` | Deletes alarm then reloads. | `DELETE /api/admin/alarm-logs/{alarm_id}` |
| frontend/src/pages/AdminPage.tsx `handleAddDevice` | POST | `${API_BASE_URL}/api/admin/device-list` | Creates device then reloads. | `POST /api/admin/device-list` |
| frontend/src/pages/AdminPage.tsx `handleEditDevice` | PUT | `${API_BASE_URL}/api/admin/device-list/{deviceId}` | Updates device then reloads. | `PUT /api/admin/device-list/{device_id}` |
| frontend/src/pages/AdminPage.tsx `handleDeleteDevice` | DELETE | `${API_BASE_URL}/api/admin/device-list/{deviceId}` | Deletes device then reloads. | `DELETE /api/admin/device-list/{device_id}` |
| frontend/src/pages/AdminPage.tsx `handleAddDataSource` | POST | `${API_BASE_URL}/api/admin/data-sources/{selectedClient}` | Creates data source then reloads. | `POST /api/admin/data-sources/{client_id}` |
| frontend/src/pages/AdminPage.tsx `handleEditDataSource` | PUT | `${API_BASE_URL}/api/admin/data-sources/{selectedClient}/{sourceId}` | Updates data source then reloads. | `PUT /api/admin/data-sources/{client_id}/{source_id}` |
| frontend/src/pages/AdminPage.tsx `handleDeleteDataSource` | DELETE | `${API_BASE_URL}/api/admin/data-sources/{selectedClient}/{sourceId}` | Deletes data source then reloads. | `DELETE /api/admin/data-sources/{client_id}/{source_id}` |
| frontend/src/pages/AdminPage.tsx `handleSetActiveDataSource` | POST | `${API_BASE_URL}/api/admin/data-sources/{selectedClient}/{sourceId}/set-active` | Marks data source active then reloads. | `POST /api/admin/data-sources/{client_id}/{source_id}/set-active` |

### Frontend env vars
- Runtime config: `REACT_APP_API_URL`, `REACT_APP_ENVIRONMENT`, `REACT_APP_ANALYTICS_V2_TRANSPORT`, `REACT_APP_ANALYTICS_EXPERIENCE`, `REACT_APP_FEATURE_ANALYTICS_V2`, `REACT_APP_EXPOSE_ANALYTICS_LEGACY`, `REACT_APP_EXPOSE_ANALYTICS_V2`, `REACT_APP_DASHBOARD_ANALYTICS_TIMEOUT_MS`, `NODE_ENV`.

## Backend
- App entrypoint: backend/fastapi_app.py defines the FastAPI app and all routes.
- Middleware/auth approach:
  - CORS middleware (allowed origins from backend/app/config.py).
  - Admin routes use HTTP Basic auth via `authenticate_user` dependency (backend/app/auth.py).
  - Some endpoints also accept `view_token` query params (alarm logs, device list, chart data, event search, snapshots).

### Endpoint inventory
| Method(s) | Path | Handler | Source file | Auth requirement | Called by frontend? |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/register-interest` | `register_interest` | backend/fastapi_app.py | Public | Yes (LandingPage) |
| POST | `/api/login` | `login` | backend/fastapi_app.py | Public | Yes (Login) |
| POST | `/api/admin/create-view-token` | `create_admin_view_token` | backend/fastapi_app.py | HTTP Basic (admin only) | Yes (AdminPage) |
| GET | `/api/view-dashboard/{token}` | `get_view_dashboard_info` | backend/fastapi_app.py | View token | Unknown (no frontend call found) |
| GET | `/api/chart-data` | `get_chart_data` | backend/fastapi_app.py | HTTP Basic or `view_token` | Yes (AnalyticsPage) |
| GET | `/api/search-events` | `search_events` | backend/fastapi_app.py | HTTP Basic or `view_token` | Yes (EventLogsPage) |
| GET | `/api/search-events/export` | `export_search_events` | backend/fastapi_app.py | HTTP Basic or `view_token` | Unknown (frontend exports client-side) |
| GET | `/api/snapshots/latest` | `get_latest_snapshot` | backend/fastapi_app.py | `org` or `viewToken` query required | Yes (ReportsPage, Dashboard v2 widgets) |
| POST | `/api/analytics/run` and `/analytics/run` | `execute_analytics_run` | backend/fastapi_app.py | Requires `orgId` or `viewToken`; currently returns 410 | Yes (dashboard + analytics v2 transports) |
| GET | `/api/analytics/run` and `/analytics/run` | `analytics_run_get` | backend/fastapi_app.py | Public (returns 405) | No direct frontend call found |
| GET | `/api/admin/users` | `get_users` | backend/fastapi_app.py | HTTP Basic (admin only) | Yes (AdminPage, AlarmLogsPage, DeviceListPage) |
| POST | `/api/admin/users` | `create_user` | backend/fastapi_app.py | HTTP Basic (admin only) | Yes (AdminPage) |
| PUT | `/api/admin/users/{username}` | `update_user` | backend/fastapi_app.py | HTTP Basic (admin only) | Yes (AdminPage) |
| DELETE | `/api/admin/users/{username}` | `delete_user` | backend/fastapi_app.py | HTTP Basic (admin only) | Yes (AdminPage) |
| GET | `/api/admin/data-sources/{client_id}` | `get_data_sources` | backend/fastapi_app.py | HTTP Basic (admin only) | Yes (AdminPage, DeviceListPage) |
| POST | `/api/admin/data-sources/{client_id}` | `add_data_source` | backend/fastapi_app.py | HTTP Basic (admin only) | Yes (AdminPage) |
| PUT | `/api/admin/data-sources/{client_id}/{source_id}` | `update_data_source` | backend/fastapi_app.py | HTTP Basic (admin only) | Yes (AdminPage) |
| DELETE | `/api/admin/data-sources/{client_id}/{source_id}` | `delete_data_source` | backend/fastapi_app.py | HTTP Basic (admin only) | Yes (AdminPage) |
| POST | `/api/admin/data-sources/{client_id}/{source_id}/set-active` | `set_active_data_source` | backend/fastapi_app.py | HTTP Basic (admin only) | Yes (AdminPage) |
| GET | `/api/alarm-logs` | `get_alarm_logs` | backend/fastapi_app.py | HTTP Basic or `view_token` | Yes (AlarmLogsPage, AdminPage) |
| POST | `/api/admin/alarm-logs` | `create_alarm_log` | backend/fastapi_app.py | HTTP Basic (admin only) | Yes (AdminPage) |
| PUT | `/api/admin/alarm-logs/{alarm_id}` | `update_alarm_log` | backend/fastapi_app.py | HTTP Basic (admin only) | Yes (AdminPage) |
| DELETE | `/api/admin/alarm-logs/{alarm_id}` | `delete_alarm_log` | backend/fastapi_app.py | HTTP Basic (admin only) | Yes (AdminPage) |
| GET | `/api/device-list` | `get_device_list` | backend/fastapi_app.py | HTTP Basic or `view_token` | Yes (DeviceListPage, AdminPage) |
| POST | `/api/admin/device-list` | `create_device` | backend/fastapi_app.py | HTTP Basic (admin only) | Yes (AdminPage) |
| PUT | `/api/admin/device-list/{device_id}` | `update_device` | backend/fastapi_app.py | HTTP Basic (admin only) | Yes (AdminPage) |
| DELETE | `/api/admin/device-list/{device_id}` | `delete_device` | backend/fastapi_app.py | HTTP Basic (admin only) | Yes (AdminPage) |
| GET | `/api/dashboards/{dashboard_id}` | `fetch_dashboard_manifest` | backend/fastapi_app.py | `orgId` or `viewToken` query required | Yes (Dashboard v2 transport) |
| POST | `/api/dashboards/{dashboard_id}/widgets` | `pin_dashboard_widget` | backend/fastapi_app.py | `orgId` query required (no auth enforced) | Yes (Dashboard v2 transport) |
| DELETE | `/api/dashboards/{dashboard_id}/widgets/{widget_id}` | `unpin_dashboard_widget` | backend/fastapi_app.py | `orgId` query required (no auth enforced) | Yes (Dashboard v2 transport) |
| GET | `/` | `serve_index` | backend/fastapi_app.py | Public | Yes (SPA entry) |
| GET | `/{full_path:path}` | `serve_spa` | backend/fastapi_app.py | Public (non-api/static) | Yes (SPA routing) |

### Backend env vars
- FastAPI app: `ANALYTICS_CACHE_TTL`, `ANALYTICS_RUN_CACHE_TTL`, `ANALYTICS_OFFLINE_MODE`, `PORT`.
- CORS/origins config: `NODE_ENV`, `REPLIT_DOMAINS`, `CLOUD_RUN_SERVICE_URL`, `PRODUCTION_DOMAIN`.
- BigQuery and snapshots: `BQ_PROJECT`, `BQ_DATASET`, `BQ_LOCATION`, `GOOGLE_CLOUD_LOCATION`, `GOOGLE_APPLICATION_CREDENTIALS`, `BQ_SERVICE_ACCOUNT_JSON`, `BQ_ENABLE_BQSTORAGE`, `ANALYTICS_BQ_TIMEOUT_SECONDS`, `GOOGLE_CLOUD_PROJECT`.
- Analytics/contract routing: `EVENT_TIMESTAMP_COLUMN`, `EVENT_TIMESTAMP_COLUMNS`, `ANALYTICS_DEBUG_SQL`.

## Shared / Contracts
- Backend Pydantic models live in backend/app/models.py (login, chart data, alarms, devices, dashboards, etc.).
- Analytics contract validation is in backend/app/analytics/contracts.py (ChartSpec/ChartResult validators).
- Canonical analytics data contract + QueryContext lives in backend/app/analytics/data_contract.py.
- Frontend analytics types live in frontend/src/analytics/schemas/charting.ts and frontend/src/types/*.ts.
- Shared JSON schemas exist in shared/analytics/schemas/*.schema.json (chart spec/result).
- Analytics contract endpoint: `/api/analytics/run` expects AnalyticsRunRequest (backend/fastapi_app.py) and is called by frontend analytics/dashboard transports.

## CI/CD + Deploy
- CI workflow: .github/workflows/ci.yml
  - Runs `npm ci` and `npm run check` in frontend.
  - Uses Node 20 and npm cache with frontend/package-lock.json.
  - Builds and pushes Docker image to GHCR (`ghcr.io/${{ github.repository }}:${{ github.sha }}`) after frontend check.
- Dockerfile: multi-stage build (Node 20 for React build → Python 3.11 slim for FastAPI) and runs `uvicorn backend.fastapi_app:app`.
- app.yaml: Cloud Run deployment hints and env var suggestions.
- pyproject.toml: minimal Python project metadata (no extra tooling configured).

## Uncertainties / Questions
- The frontend routes for `/analytics*` all render `AnalyticsComingSoonPage`, but there is an `AnalyticsPage` component that calls `/api/chart-data`. Is the intent to wire `/analytics` to `AnalyticsPage` (or v2) in production?
- `/api/analytics/run` is called by dashboard/analytics transports, but the backend handler returns HTTP 410 (“snapshots-only mode”). Is that still intentional for live deployments?
- `triggerExport` posts to `/api/analytics/export-placeholder`, but no backend route exists for that path. Should there be a real export endpoint?
- Dashboard manifest mutation endpoints (`POST/DELETE /api/dashboards/.../widgets`) require only `orgId` and do not enforce authentication. Is that intended?
- Event log exports: frontend exports CSV from `/api/search-events`, while backend also exposes `/api/search-events/export`. Should the frontend use the export endpoint instead?
