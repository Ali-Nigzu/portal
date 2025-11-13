# Analytics Foundations Overview

This document captures the Phase 1 analytics deliverables, how to work with the
fixtures, and the operating assumptions confirmed with product before we begin
Phase 2.

## Canonical Schema Rules

- **Table structure**: Every client owns a dedicated BigQuery table (e.g.
  `nigzsu.client_events.client0`, `nigzsu.client_events.client1`).
- **Schema**: Each table must implement the canonical CCTV event schema defined
  in `shared/analytics/schemas/chart-spec.schema.json` and
  `shared/analytics/schemas/chart-result.schema.json`. The backend validator in
  `backend/app/analytics/schema_validator.py` enforces:
  - Required columns with correct data types.
  - Partitioning on `DATE(timestamp)` and clustering on `(site_id, cam_id)`.
  - No tolerance for cross-client joins—validation runs per table.
- **Routing**: Organisation → table mapping is handled via configuration (see
  `backend/app/analytics/contracts.py` for dataclasses and `README.md` for the
  default mapping guidance). Phase 2 will extend this into the Spec→SQL
  compiler.

## Fixture Workflow

1. **Fixture dataset**: Deterministic CCTV events live in
   `shared/analytics/fixtures/events_golden_client0.csv`. The dataset uses
   canonical identifiers (`SITE_01`, `CAM_A`, etc.) drawn directly from event
   rows—no external metadata service is required yet.
2. **Loading into BigQuery**: Follow the command snippet in
   `shared/analytics/fixtures/README.md` to load the CSV into a temporary table
   (e.g. `nigzsu.analytics_fixtures.client0_events`).
3. **Generating expected outputs**: Run `python backend/app/analytics/generate_expected.py`
   to regenerate all ChartResult JSON blobs under `shared/analytics/examples`.
   The script recalculates metrics from the fixture CSV to keep JSON in sync.
4. **Schema validation**: Execute `pytest backend/tests/test_schema_validator.py`
   to assert that configured tables match the canonical schema and partitioning
   expectations.

## Golden Outputs

- Stored under `shared/analytics/examples` with filenames matching the preset
  scenarios in the development plan (e.g. `golden_dashboard_live_flow.json`,
  `golden_retention_heatmap.json`).
- Each file adheres to the ChartResult schema. They form the regression suite
  for both backend and frontend consumers.

## Validation Commands

```bash
# Validate JSON Schemas + examples
pytest backend/tests/test_chart_schemas.py

# Validate fixture parity + schema rules
pytest backend/tests/test_golden_outputs.py
pytest backend/tests/test_schema_validator.py
```

These tests run in CI and must pass before merging future analytics work.

## Confirmed Operating Assumptions

- **Per-client tables**: One table per client; canonical schema shared. No data
  mixing between clients.
- **Site & camera metadata**: Derived directly from the events tables. Generic
  identifiers (`SITE_01`, `CAM_A`, etc.) are acceptable for v1.
- **Timezone handling**: All timestamps are UTC today. UI/queries should label as
  UTC; design remains flexible to add per-site timezones later.
- **Caching layer**: Local in-process cache remains the default. A cache
  abstraction (local vs. Redis) will be introduced in Phase 2 so Cloud
  Memorystore can be wired in via `CACHE_BACKEND` and `REDIS_URL`.

## Readiness for Phase 2

- Schemas, fixtures, golden outputs, and validators are complete.
- Outstanding work: author SQL templates and spec→SQL compiler, design cache
  abstraction, and wire per-client routing into the runtime execution path.


### Phase 2 Design Outline (Ready to Execute)

1. **Spec→SQL Compiler Skeleton**
   - Build a parser that validates incoming `ChartSpec` using the JSON Schema and
     normalises filter primitives.
   - Map each `spec.chart.type` to a template module (occupancy, activity,
     throughput, dwell, demographics, retention) producing parameterised SQL
     fragments.
   - Compose `SELECT`, `FROM`, `WHERE`, `GROUP BY`, and `WINDOW` fragments using a
     deterministic builder to avoid string concatenation bugs.
2. **Table Routing**
   - Resolve `organisation_id` from the authenticated session.
   - Look up the physical table name via configuration (phase 1 dataclasses) and
     inject it into the compiler context so every query targets the correct
     client table.
   - Add unit tests covering both `client0` and `client1` mappings.
3. **Execution & Normalisation**
   - Execute the compiled SQL against BigQuery using the service account.
   - Normalise results into `ChartResult` payloads (series assembly, coverage,
     surge metadata) leveraging existing fixture expectations.
4. **Caching Abstraction**
   - Introduce `CacheBackend` protocol with `LocalCacheBackend` implementation.
   - Hash `ChartSpec` + time window to key cache entries.
   - Defer Redis backend wiring until infrastructure is available, but keep the
     interface ready for a drop-in `RedisCacheBackend`.

### Open Questions Before Coding

- None. All clarifications from product are captured above. Ready to proceed with
  Phase 2 implementation when approved.
