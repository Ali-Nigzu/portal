## Phase 9 live transport understanding

- **Backend endpoints**: `POST /analytics/run` and `POST /api/analytics/run` both execute analytics specs through the `AnalyticsEngine`. Matching `GET` requests return HTTP 405.
- **Frontend callers**:
  - Analytics workspace invokes `runAnalyticsQuery` in `frontend/src/analytics/v2/transport/runAnalytics.ts`, which `fetch`es `POST ${API_BASE_URL}/api/analytics/run`.
  - Dashboard widgets call `loadWidgetResult` in `frontend/src/dashboard/v2/transport/loadWidgetResult.ts`, also posting to `${API_BASE_URL}/api/analytics/run`.
- **Transport selection**: `resolveAnalyticsV2Transport` in `frontend/src/config.ts` returns `'live'` by default unless `REACT_APP_ANALYTICS_V2_TRANSPORT=fixtures` overrides it. Individual callers can still force fixture mode, but the production bundle now defaults to live.

This note captures the intended contract before applying any fixes for the 405 regression.
