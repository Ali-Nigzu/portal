# Phase 7 Handover – Cleanup & Truth Alignment

## Bugs reproduced and fixed

| Issue | Reproduction | Resolution |
| --- | --- | --- |
| `/dashboard` manifest 404 | Run backend+frontend, visit `/dashboard` – FastAPI catch-all returned `{"detail":"API or static route not found"}` before the manifest routes were registered. | Manifest endpoints (`/api/dashboards/...`) are now mounted before the SPA fallback in `backend/fastapi_app.py`. Backend tests hit the real route and the default `client0` manifest always returns KPI + Live Flow widgets. |
| Retention Heatmap validation failure | `/analytics` → select "Retention Heatmap" → ChartRenderer showed "Chart result failed validation" because the fixture only populated partial grid rows. | Updated `golden_retention_heatmap.json` (frontend + shared copies) to provide a complete cohort × lag matrix, added validator + renderer tests to guard it, and fixture now renders normally. |
| Inspector controls felt “dead” | In fixture transport mode the time-range, split, and metric chips flipped styles but the chart never changed. | Controls are now explicitly disabled (with inline messaging) whenever transport mode is `fixtures`. Live transport keeps the interactive behaviour. Documented in the dev plan + README. |

## Manifest API quick reference

* `GET /api/dashboards/{dashboard_id}?orgId=client0` → returns manifest with seeded widgets + inline specs.
* `POST /api/dashboards/{dashboard_id}/widgets` → pins a widget (supply `widget`, `targetBand`, `position`).
* `DELETE /api/dashboards/{dashboard_id}/widgets/{widget_id}` → removes a non-locked widget.
* Routes are defined near the bottom of `backend/fastapi_app.py` and backed by `backend/app/analytics/dashboard_catalogue.py`.
* Default manifest template lives in `shared/analytics/examples/dashboard_manifest_client0.json`.

## Analytics transport modes

* Frontend transport defaults to `fixtures` (`ANALYTICS_V2_TRANSPORT` env).
* Switch to live by exporting `REACT_APP_ANALYTICS_V2_TRANSPORT=live` before `npm start` (or build).
* Backend `/analytics/run` expects BigQuery credentials via `GOOGLE_APPLICATION_CREDENTIALS` or `BQ_SERVICE_ACCOUNT_JSON`.
* Inspector controls lock when fixtures are active. This is intentional and documented; flip to live to regain full interactivity.

## Testing + QA checklist

1. `pytest`
2. `npm --prefix frontend run lint`
3. `CI=true npm --prefix frontend test`
4. `npm --prefix frontend run build`
5. Manual:
   * `/dashboard` shows seeded KPI band + Live Flow without 404 banner.
   * `/analytics` renders Live Flow, Average Dwell by Camera, and Retention Heatmap presets using fixtures.
   * Toggle transport to `live` to confirm inspector controls unlock.

## Next phase preview

Phase 8 will be the UX/usability redesign inspired by Pipedrive Insights, Victron VRM, FoxESS, and SO Energy. With the manifest API stable, retention data rendering, and inspector honesty restored, the next engineer can focus entirely on layout/visual polish, richer interactions, and multi-chart workflows without worrying about broken plumbing.
