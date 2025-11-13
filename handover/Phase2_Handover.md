# Phase 2 Handover

## Running the compiler
1. Ensure the virtual environment is active (`poetry shell` or equivalent) and dependencies installed (`poetry install`).
2. Prepare a valid `ChartSpec` JSON (see `shared/analytics/examples/golden_dashboard_live_flow.json` or `shared/analytics/examples/chartresult_phase2_example.json` for structure).
3. Run the compiler directly:
   ```bash
   python - <<'PY'
   from backend.app.analytics.compiler import SpecCompiler, CompilerContext
   from backend.app.analytics.router import TableRouter

   spec = {...}  # populate with the chart spec to compile
   context = CompilerContext(table_name=TableRouter({"client0": "nigzsu.dataset.client0"}).resolve("client0"))
   compiled = SpecCompiler().compile(spec, context)
   print(compiled.sql)
   print(compiled.params)
   PY
   ```
   This prints the generated BigQuery SQL and bound parameters ready for execution.

## Running the tests
- Execute the Phase 2 regression suite with:
  ```bash
  pytest backend/tests/test_analytics_engine_phase2.py \
         backend/tests/test_chart_schemas.py \
         backend/tests/test_golden_outputs.py \
         backend/tests/test_schema_validator.py \
         backend/tests/test_analytics_bigquery.py
  ```
  These cover compiler behaviour, schema validation, golden fixtures, and cache/engine wiring.

## Fixture locations
- Golden CSV input: `shared/analytics/fixtures/events_golden_client0.csv`
- Generated golden ChartResults: `shared/analytics/examples/`
- Compiler-specific helper fixtures: `backend/app/analytics/fixtures.py`

## BigQuery integration status
- The analytics engine currently executes entirely against pandas DataFrames sourced from fixtures or stubs. Live BigQuery connectivity (service account auth + table routing) is not yet wired into runtime execution.

## UI-facing behaviour you should rely on
- Occupancy buckets seeded solely by exit events maintain the carried occupancy value but downgrade coverage to ≤ 0.5; surface these points as low-confidence rather than authoritative counts.
- Dwell buckets without any paired sessions return `value = null` and `rawCount = 0`, indicating an intentional gap the UI should render as missing data.
- Retention heatmap cells scale coverage against the `_RETENTION_MIN_COHORT` (100) threshold so small cohorts appear with low coverage even when retention rates are high; preserve this signal in tooltips/legends.
- All time-series metrics (occupancy, activity, throughput, dwell) consume the shared canonical bucket calendar so buckets are never skipped and leading/trailing partial windows only influence coverage.
- Heatmap metrics (retention) return the full cohort × lag grid with deterministic ordering; cells are never omitted even when `rawCount = 0`.

## ChartResult contract (frontend binding)
- Each `series` entry exposes `id`, `label`, `unit`, `geometry`, `axis`, optional `meta`, and a `points` array.
- Time/ordinal points contain `bucket`, `value`, `rawCount`, `coverage`, and optional `surge`; `null` values are intentional gaps, not errors.
- Heatmap points contain `row`, `column`, `value`, `rawCount`, and `coverage`.
- Units stay human-readable (`people`, `events`, `events/min`, `minutes`, `%`) and should drive tick formatting.
- The backend contract is frozen for Phase 3: field names, bucket semantics, and coverage behaviour will not change without an explicit callout in the development plan.

## Next TODO items
1. Connect the BigQuery client used by `AnalyticsEngine` to the real service account and execute compiled SQL against per-client tables.
2. Expose the `/analytics/run` API endpoint so frontend consumers can request ChartResults over HTTP.
3. Extend caching beyond the local in-process backend (e.g., prepare Redis adapter) once live execution is stable.

## Handover summary for the next Codex (Phase 3 kickoff)
- **Phase 3 focus:** build the shared frontend chart engine (`<ChartRenderer />`), axis/series manager, card chrome, and KPI primitives that render Phase 2 `ChartResult` objects without recomputing analytics.
- **Read first:**
  - `ANALYTICS_DEVELOPMENT_PLAN.md` – Section “Phase 3 – Shared Frontend Chart Engine & Card Primitives”.
  - `shared/analytics/examples/chartresult_phase2_example.json` and `shared/analytics/examples/golden_dashboard_live_flow.json` – canonical fixtures to load in Storybook.
- **Frontend codebase entry points:**
  - `frontend/src/analytics/` (existing analytics utilities) and `frontend/src/components/` for shared primitives.
  - Create or extend a charting module under `frontend/src/charting/` (or equivalent) to host the reusable renderer and axis manager.
  - Storybook lives at `frontend/src/stories/`; add Phase 3 stories here using the provided ChartResult fixtures.
- **Local workflow:**
  - Run `npm install` (or `yarn`) inside `frontend/`, then `npm run storybook` to iterate on the shared engine using fixtures.
  - Use `npm run start` only for smoke-checking integration; Phase 3 work should remain isolated from production routes.
- **Key behaviour reminders:** maintain canonical bucket calendars, surface coverage/rawCount in tooltips, render null dwell buckets as gaps, and visually flag low-coverage occupancy points.
