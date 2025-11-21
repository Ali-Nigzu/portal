# Data Contracts

Canonical rules for how analytics data is sourced, compiled, validated, and delivered. This is the source of truth for schemas, mappings, and chart contracts.

## Canonical data model

One BigQuery events table per client:

- `client0` → `nigzsu.${BQ_DATASET}.client0`
- `client1` → `nigzsu.${BQ_DATASET}.client1`

Columns (no others are referenced; the compiler adapts demodata0 tables into this canonical shape):

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

All analytics computations must originate from these columns. The scoped events CTE in the compiler:

- Maps integer-coded demographics to canonical strings (`sex`: `0 → 'Male'`, `1 → 'Female'`; `age_bucket`: `0 → '0-4'`, `1 → '5-13'`, `2 → '14-25'`, `3 → '26-45'`, `4 → '46-65'`, `5 → '66+'`).
- Reconstructs `index` via `ROW_NUMBER() OVER (PARTITION BY site_id, cam_id, track_id ORDER BY timestamp, event DESC, track_id)`.
- Enforces `timestamp < @now` (where `@now` is bound per query as `min(requested_end_ts, current_time_in_timezone)`).

## Analytics contract

### ChartSpec (input)

- chartType: supported chart type (e.g., line, bar, heatmap, retention presets mapping to validated types).
- measures: vetted metric identifiers defined in `backend/app/analytics/data_contract.py`.
- dimensions: allowed dimensions only (time, site, camera, sex, age_bucket, retention lags, etc.).
- timeRange: validated bounds (last 24h, last 7d, custom, etc.) with default buckets chosen by range.
- filters/splits: only from canonical dimensions; no ad hoc columns.
- orgId: maps to the client table above.

### ChartResult (output)

Validated by `validate_chart_result` before leaving the backend:

- chartType: must be an allowed value (e.g., heatmap for retention matrices).
- xDimension: object with `id` (string), `type` (`time` | `category` | `matrix` | `index`), and optional `bucket` (string).
- series: array where each entry has `id` (string), `geometry` (allowed geometries only), optional `axis` (`Y1`/`Y2`/`Y3`), and `data`.
- Points: each point in `data` (and in any `meta.coverage`) may only contain `{ x: string, y?: number|null, value?: number|null, coverage?: number|null, rawCount?: number|null }`.
- meta: must include `timezone` (string); may include `coverage` arrays that follow the same point shape.

No extra fields (e.g., `group`, `lag`) are permitted in points. Every response must pass the validator; failures must be fixed in normalisation, not by weakening validation.

## Metric rules

- **Entrances**: `COUNTIF(event = 1)` within the time window; bucket by time when requested.
- **Exits**: `COUNTIF(event = 0)`; buckets mirror entrances.
- **Occupancy**: Running sum of entrances minus exits ordered by `timestamp, index`; bucketed for peak values.
- **Average Dwell Time**: Pair entrance/exit per `track_id`, clamp sessions to ≤ 6 hours, average minutes per bucket.
- **Retention**: Cohort by first entrance week/month; lag weeks/months measure return fraction per cohort using the same `track_id` values.
- **Coverage/Freshness**: Derived from event presence in each bucket; never fabricated beyond available rows.

## Invariants

1. All analytics SQL is generated through the compiler and data contract; no handwritten SQL or frontend math.
2. Only the canonical columns above may appear in generated SQL; conceptual names are mapped in the compiler, not in queries.
3. Org routing is mandatory: every request resolves `orgId` to the correct table before compilation.
4. No synthetic cohorts, lags, or padding—results reflect only BigQuery rows. Missing combinations surface as `null` values, not fabricated records.
5. Contract validation (`validate_chart_result`) is the gatekeeper; anything failing validation must be corrected at the data/normalisation layer.
