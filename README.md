# Analytics Portal — Data to Dashboard

A manifest-driven analytics portal that turns CCTV event streams into charts and KPIs. The system serves multiple clients, compiling vetted ChartSpecs into BigQuery SQL and returning validated ChartResults for the React dashboard and analytics workspace.

## Data source

All analytics come from canonical BigQuery event tables — no frontend math or synthetic rows. Each client maps to a single table:

- `client0` → `nigzsu.${BQ_DATASET}.client0`
- `client1` → `nigzsu.${BQ_DATASET}.client1`

Canonical schema (all columns are referenced by the compiler and nothing else):

```
site_id     INTEGER
cam_id      INTEGER
index       INTEGER
track_id    STRING
event       INTEGER  -- 1 = entrance, 0 = exit
timestamp   TIMESTAMP
sex         STRING
age_bucket  STRING
```

## Backend flow

1. The frontend posts a `ChartSpec` to `POST /api/analytics/run` with `orgId` for the client.
2. FastAPI validates the spec against the Phase 2 contract and resolves the org slug to the BigQuery table.
3. A `QueryContext` is built (time range, filters, dimensions) and the compiler generates parameterised BigQuery SQL.
4. BigQuery executes the query; results are normalised into a `ChartResult` matching the contract.
5. `validate_chart_result` enforces chart type, axes, series, points, and `meta.timezone` before the payload is returned.
6. The response is cached and sent back to the caller; every chart and KPI uses this path—no ad hoc SQL or client-side math.

## Frontend flow

- **Dashboard**: Reads a manifest of KPI and chart widgets, then fetches each widget via `/api/analytics/run` for the selected org.
- **Analytics workspace**: Presents curated presets (Live Flow, Occupancy, Dwell, Retention, etc.). Presets are ChartSpec templates that set chart type, measures, dimensions, time ranges, filters, and splits. Inspector controls tweak the spec; the frontend only renders the returned `ChartResult`.
- Shared TypeScript types mirror the backend contract so validation errors surface consistently in the UI.

## Chart logic (conceptual)

- **Total Entrances**: Count of `event = 1` within the window, grouped by time when charted.
- **Total Exits**: Count of `event = 0` within the window.
- **Peak Occupancy**: Cumulative entrances minus exits ordered by `timestamp, index`; maximum per bucket.
- **Average Dwell Time**: Pair entrance/exit per `track_id`, clamp to sessions ≤ 6 hours, average dwell minutes per bucket.
- **Retention Heatmap**: Cohort by first entrance week; lag weeks measure return fraction for the same `track_id` cohort.
- **Demographic cuts**: Filters/splits on `sex` and `age_bucket`, mapped directly from integer-coded source columns.

All values originate from BigQuery rows; coverage/freshness is derived server-side from the same events.

## Local development

1. **Backend**
   ```bash
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r backend/requirements.txt
   python3 -m uvicorn backend.fastapi_app:app --host 0.0.0.0 --port 8000 --reload
   ```
   Environment for live data:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json
   export BQ_PROJECT=nigzsu
   export BQ_DATASET=demodata0
   export BQ_LOCATION=EU
   ```

2. **Frontend**
   ```bash
   cd frontend
   npm install
   REACT_APP_API_URL=http://localhost:8000 npm start
   ```
   Live transport is the default; set `REACT_APP_ANALYTICS_V2_TRANSPORT=fixtures` for curated fixture responses.

3. **Testing**
   ```bash
   pytest
   npm --prefix frontend run lint
   CI=true npm --prefix frontend test -- --watch=false --silent
   npm --prefix frontend run build
   ```

## More reading

- [Dev plan](docs/dev-plan.md) — product definition, architecture, roadmap, and workflow for adding metrics.
- [Data contracts](docs/data-contracts.md) — canonical schema, chart contracts, and non-negotiable analytics rules.
