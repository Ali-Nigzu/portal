## Phase 9 live transport understanding

- **Backend endpoints**: `POST /analytics/run` and `POST /api/analytics/run` both execute analytics specs through the `AnalyticsEngine`. Matching `GET` requests return HTTP 405. Organisation slugs (`orgId`) resolve to fully qualified tables via `backend/app/analytics/org_config.py`.
- **Frontend callers**:
  - Analytics workspace invokes `runAnalyticsQuery` in `frontend/src/analytics/v2/transport/runAnalytics.ts`, which `fetch`es `POST ${API_BASE_URL}/api/analytics/run`.
  - Dashboard widgets call `loadWidgetResult` in `frontend/src/dashboard/v2/transport/loadWidgetResult.ts`, also posting to `${API_BASE_URL}/api/analytics/run`.
- **Org resolution**: Login responses include `orgId`/`org_id` plus `table_name`. The frontend derives a consistent org via `frontend/src/utils/org.ts` (`client1` → `client0`, `client2` → `client1`, `admin` → `client0`) and passes it to analytics/dashboard transports. The backend mirrors this via `_org_id_for_user_record` + `backend/app/analytics/org_config.py` so `/api/analytics/run` always targets `nigzsu.demodata.<org>`.
- **Transport selection**: `resolveAnalyticsV2Transport` in `frontend/src/config.ts` returns `'live'` by default unless `REACT_APP_ANALYTICS_V2_TRANSPORT=fixtures` overrides it. Individual callers can still force fixture mode, but the production bundle now defaults to live.
- **Error logging**: `backend/app/analytics/engine.py` logs the compiled SQL, organisation, and table whenever BigQuery raises `BigQueryDataFrameError` so syntax or mapping regressions can be diagnosed quickly.

This note captures the intended contract before applying any fixes for the 405 regression.
