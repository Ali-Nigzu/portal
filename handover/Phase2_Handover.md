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

## Next TODO items
1. Connect the BigQuery client used by `AnalyticsEngine` to the real service account and execute compiled SQL against per-client tables.
2. Expose the `/analytics/run` API endpoint so frontend consumers can request ChartResults over HTTP.
3. Extend caching beyond the local in-process backend (e.g., prepare Redis adapter) once live execution is stable.
