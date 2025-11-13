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

## Next TODO items
1. Connect the BigQuery client used by `AnalyticsEngine` to the real service account and execute compiled SQL against per-client tables.
2. Implement the dwell metric pipeline end-to-end (spec dispatch, SQL compilation, normalisation, and fixtures/tests).
3. Implement the retention metric pipeline with the agreed visit-boundary logic, including coverage metadata and golden expectations.
4. Extend caching beyond the local in-process backend (e.g., prepare Redis adapter) once live execution is stable.
