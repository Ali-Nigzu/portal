# LINE Analytics Rebuild Development Plan

## 1. Context & Product Vision

LINE is a CCTV analytics platform delivered as a responsive web application. It must give business owners an elegant control centre to understand and act on real-world movement across their sites. The product has two flagship surfaces:

* **Client Dashboard** – the landing workspace with a KPI band, a continuously updating *Live Flow* visual, and at least one customisable chart card the operator can pin from Analytics.
* **Analytics Workspace** – a multi-tab exploratory environment (Trends, Demographics, Patterns, Retention) where users start from sensible presets, tweak configurations through a guided builder, and save/share charts.

We benchmark against the polish of Pipedrive Insights, Victron VRM, FoxESS, and SO Energy. LINE must meet or exceed their level of mathematical trustworthiness, interactivity (zoom, hover, toggles, export), visual refinement, and responsiveness.

**Product pillars (non-negotiable)**

1. **Accuracy first.** Every KPI and chart must come from deterministic, back-end computed math. The current React helpers that recompute occupancy or dwell inside components are discarded.
2. **Spec-driven modularity.** All visuals, from KPI tiles to heatmaps, are defined by a `ChartSpec`. Rendering code should never hard-code datasets or measures; it should consume `ChartResult` objects.
3. **Interactive parity.** Dashboard cards and analytics charts share the same engine with zoom, hover sync, multi-axis toggles, comparison overlays, and exports that reflect the visible state.
4. **Elegance & accessibility.** Card chrome, spacing, colour, typography, and dark-theme treatments must be systematized. Layouts respond gracefully from small laptops to large monitors. Keyboard navigation, focus states, and ≥4.5:1 contrast are required.
5. **Single source of truth.** Every metric is derived from the canonical CCTV event stream in BigQuery. No local-only caches, no duplicated logic.

**Current state (blunt assessment)**

* Dashboard KPIs and the Live Flow chart recompute math in React, are inaccurate, and lack trust signals.
* The analytics builder exposes raw JSON-like filter trees and hard-coded unions; it is unusable for business owners.
* Pins and saved views only write `localStorage` blobs that nothing reads. There is no backend persistence for layouts or specs.
* Layouts are rigid and inline-styled, producing brittle experiences on anything but the target design width.
* Tooltips, legends, exports, and axis logic differ per component; there is no shared engine.

This plan replaces the current implementation with a tested, modular, preset-first analytics platform grounded in the real CCTV schema.

## 2. Data Source & Canonical Schema (CCTV + BigQuery)

The only authoritative analytics data source is the CCTV event stream materialised in BigQuery using the service account defined in `sa.json` (project `nigzsu`). The table path resolves to `nigzsu.<dataset>.events`; exact dataset naming is environment-specific and must be configurable. All queries use BigQuery Standard SQL with parameter binding.

**Event schema (column order matches ingestion files):**

| Column | Type | Description |
| --- | --- | --- |
| `site_id` | STRING | Unique identifier for a client site. Treat as opaque string even if numeric in raw feeds. |
| `cam_id` | STRING | Camera or zone identifier. |
| `index` | INT64 | Sequential index inside the ingestion file/stream. Monotonic per camera but not globally unique. |
| `track_no` | STRING | Person/session identifier linking entrances and exits. |
| `event_type` | INT64 | `1` = entrance, `0` = exit. No other values exist. |
| `timestamp` | TIMESTAMP | Local wall-clock time the event was recorded (stored in UTC with site-level timezone metadata applied in presentation). |
| `sex` | STRING | `'M'`, `'F'`, or null (mapped to `'Unknown'`). |
| `age_bucket` | STRING | One of `0-4`, `5-13`, `14-25`, `26-45`, `46-65`, `66+`; null treated as `'Unknown'`. |

**Storage expectations**

* Table partitioned by `DATE(timestamp)` to limit scan costs.
* Table clustered by `(site_id, cam_id)` to speed site-specific queries.
* Index column only used for tie-breaking within identical timestamps.

**Schema constraints & implications**

* There is **no dwell_duration column**; dwell must be derived by pairing entrance/exit rows sharing `track_no`, `site_id`, `cam_id`.
* Only entrance/exit events exist. Any notion of "activity" or "throughput" must be framed around these event types.
* Age is already bucketed; there is no granular age or DOB.
* Retention relies on `track_no` persisting across visits. We must define a visit boundary (e.g., ≥30 minutes between entrances for the same `track_no`).
* Coverage or surge indicators must be inferred from event density, bucket completeness, and historical baselines derived from the same table.

Metrics requiring additional signals (e.g., device uptime, sentiment) are out of scope until the schema expands. This plan clearly marks approximations and their justifications.

## 3. Metric Definitions & Math Pipeline

All metrics run through a deterministic pipeline:

1. **Filter**: apply site/camera/time/demographic filters in SQL.
2. **Order**: sort by `timestamp`, breaking ties with `index` for reproducibility.
3. **Compute**: execute metric-specific logic inside CTEs.
4. **Bucket**: aggregate to requested granularity (`5_MIN`, `15_MIN`, `HOUR`, `DAY`, etc.).
5. **Annotate**: calculate coverage %, surge flags, confidence notes.
6. **Assemble**: shape the data into canonical `Series` objects for the chart engine.

### 3.1 Occupancy

**Definition:** Number of people currently inside a site or zone. Calculated as the cumulative sum of entrances minus exits.

**Inputs:** `site_id`, `cam_id`, `event_type`, `timestamp`, `index`.

**Algorithm:**

1. Select events within the time window and filter scope.
2. Map `event_type = 1` → `+1`, `event_type = 0` → `-1`.
3. Compute cumulative sum ordered by `timestamp`, `index`.
4. Clamp cumulative value at 0 to avoid negative occupancy.
5. For bucketed charts, use the last occupancy inside the bucket; empty buckets inherit the previous non-empty value.
6. Default starting occupancy is 0. To carry forward state, extend the query window earlier and seed using the final occupancy of that extended window.
7. When the first in-window event is an exit, mark the bucket as low confidence (`coverage < 1.0`).
8. Reset to 0 at local day boundaries unless `carryForward` is enabled.

**BigQuery sketch:**

```sql
WITH scoped AS (
  SELECT
    site_id,
    cam_id,
    timestamp,
    index,
    IF(event_type = 1, 1, -1) AS delta
  FROM `nigzsu.<dataset>.events`
  WHERE site_id = @site_id
    AND cam_id IN UNNEST(@cam_ids)
    AND timestamp BETWEEN @start_ts AND @end_ts
),
ordered AS (
  SELECT *,
    SUM(delta) OVER (PARTITION BY site_id, cam_id ORDER BY timestamp, index) AS occ_raw
  FROM scoped
),
clamped AS (
  SELECT *, GREATEST(occ_raw, 0) AS occupancy
  FROM ordered
),
buckets AS (
  SELECT
    site_id,
    cam_id,
    TIMESTAMP_TRUNC(timestamp, @bucket_interval) AS bucket_start,
    ANY_VALUE(occupancy ORDER BY timestamp DESC, index DESC) AS occupancy_end,
    COUNT(*) AS event_count
  FROM clamped
  GROUP BY site_id, cam_id, bucket_start
)
SELECT * FROM buckets ORDER BY bucket_start;
```

### 3.2 Activity

**Definition:** Number of relevant events per bucket. Default mode counts both entrances and exits. Alternate modes (`entrances_only`, `exits_only`) reuse the same data with filtered event types.

**Inputs:** `event_type`, `timestamp`.

**BigQuery sketch:**

```sql
SELECT
  TIMESTAMP_TRUNC(timestamp, @bucket_interval) AS bucket_start,
  COUNTIF(event_type = 1) AS entrances,
  COUNTIF(event_type = 0) AS exits,
  COUNT(*) AS activity_total
FROM scoped
GROUP BY bucket_start;
```

### 3.3 Throughput

**Definition:** Activity rate per minute for a bucket.

**Formula:** `(entrances + exits) / minutes_in_bucket`.

**Edge cases:**

* Buckets at the start/end of the window may be partial. Compute `minutes_in_bucket` as `LEAST(bucket_length_minutes, TIMESTAMP_DIFF(bucket_end, bucket_start, SECOND) / 60.0)`.
* When no events occur, throughput is 0 but coverage metadata marks the bucket as low confidence.

**BigQuery sketch:**

```sql
WITH bucket_bounds AS (...),
activity AS (...)
SELECT
  b.bucket_start,
  (a.activity_total) / NULLIF(b.bucket_minutes, 0) AS throughput
FROM bucket_bounds b
LEFT JOIN activity a USING (bucket_start);
```

### 3.4 Dwell / Visit Duration

**Definition:** Time between a visitor entering and exiting the same site/camera.

**Inputs:** `track_no`, `site_id`, `cam_id`, `event_type`, `timestamp`.

**Pairing rules:**

* Pair each entrance with the next exit sharing `track_no`, `site_id`, `cam_id`.
* Ignore exits without a preceding entrance (log coverage warning).
* Ignore entrances without an exit after `MAX_SESSION_WINDOW` (default 6 hours) – treat as truncated session with flag.
* Ignore negative or zero durations (data error).
* If multiple entrances occur before an exit, treat each entrance as starting a new session; unmatched ones flagged.

**BigQuery sketch:**

```sql
WITH scoped AS (...),
entrances AS (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY site_id, cam_id, track_no ORDER BY timestamp, index) AS rn
  FROM scoped
  WHERE event_type = 1
),
exits AS (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY site_id, cam_id, track_no ORDER BY timestamp, index) AS rn
  FROM scoped
  WHERE event_type = 0
),
sessions AS (
  SELECT
    e.site_id,
    e.cam_id,
    e.track_no,
    e.timestamp AS entrance_ts,
    x.timestamp AS exit_ts,
    TIMESTAMP_DIFF(x.timestamp, e.timestamp, SECOND) / 60.0 AS dwell_minutes
  FROM entrances e
  LEFT JOIN exits x
    ON e.site_id = x.site_id
   AND e.cam_id = x.cam_id
   AND e.track_no = x.track_no
   AND e.rn = x.rn
  WHERE x.timestamp IS NOT NULL
    AND TIMESTAMP_DIFF(x.timestamp, e.timestamp, MINUTE) BETWEEN 0 AND 360
)
SELECT
  TIMESTAMP_TRUNC(entrance_ts, @bucket_interval) AS bucket_start,
  AVG(dwell_minutes) AS dwell_mean,
  APPROX_QUANTILES(dwell_minutes, 100)[OFFSET(90)] AS dwell_p90,
  COUNT(*) AS sessions
FROM sessions
GROUP BY bucket_start;
```

### 3.5 Demographics Metrics

Leverage `sex` and `age_bucket` as categorical dimensions. Examples:

* Activity counts per age bucket (`COUNT(*)` grouped by `age_bucket`).
* Average dwell per age bucket/sex using the `sessions` CTE joined with demographic columns from entrances.

Missing values map to `Unknown`. Sum of splits must match the total within rounding tolerance.

### 3.6 Retention / Returning Visitors

**Definition:** Likelihood that a visitor returns after their first visit in a cohort period.

**Inputs:** `track_no`, `timestamp`, `event_type` (entrances only).

**Visit rules:**

* Treat an entrance as the start of a visit if ≥30 minutes have passed since the previous entrance for the same `track_no` and site.
* Cohort visitors by week (Monday-start) unless spec requests monthly.
* Compute return rate for week N as (# visitors with a visit N weeks later) / (cohort size).
* Only show curves when cohort size ≥100 visitors; otherwise display informative empty state.

**BigQuery sketch:**

```sql
WITH entrances AS (
  SELECT *,
    TIMESTAMP_SUB(timestamp, INTERVAL 30 MINUTE) AS threshold
  FROM scoped
  WHERE event_type = 1
),
visits AS (
  SELECT
    site_id,
    track_no,
    timestamp AS visit_ts,
    DATE_TRUNC(timestamp, WEEK(MONDAY)) AS cohort_week,
    LAG(timestamp) OVER (PARTITION BY site_id, track_no ORDER BY timestamp) AS prev_visit_ts
  FROM entrances
),
first_visits AS (
  SELECT *
  FROM visits
  WHERE prev_visit_ts IS NULL OR TIMESTAMP_DIFF(visit_ts, prev_visit_ts, MINUTE) >= 30
),
retention AS (
  SELECT
    cohort_week,
    CAST(FLOOR(TIMESTAMP_DIFF(v.visit_ts, f.visit_ts, DAY) / 7) AS INT64) AS lag_weeks,
    COUNT(DISTINCT v.track_no) AS returning
  FROM first_visits f
  JOIN visits v USING (site_id, track_no)
  WHERE v.visit_ts > f.visit_ts
  GROUP BY cohort_week, lag_weeks
)
SELECT * FROM retention WHERE lag_weeks BETWEEN 0 AND 7;
```

### 3.7 Surge Flags & Coverage

* **Coverage %:** `observed_minutes / bucket_minutes`. Observed minutes come from gap analysis (`LEAD(timestamp)`) within the bucket. Buckets below 70% coverage are visually hatched and annotated.
* **Surge flag:** Occupancy or throughput exceeds historical baseline (`rolling_mean + 2 * rolling_stddev`) computed from the preceding 14 days for the same site/camera/bucket. Surges only flagged when coverage ≥80%.

### 3.8 Testing the Math Pipeline

* **Golden datasets:** Create small BigQuery tables (`nigzsu.analytics_fixtures.*`) with known sequences (simple alternating entrance/exit, missing exits, overlapping sessions). Expected outputs stored as JSON fixtures.
* **Invariant tests:**
  * `Σ entrances - Σ exits ≈ occupancy_end - occupancy_start`.
  * Sum of split values equals total (demographics, multi-camera views).
  * Mean dwell ≤ p90 dwell.
* **Cross-surface parity:** Automated tests comparing dashboard KPI outputs with equivalent analytics charts using the same spec.

## 4. Chart Specification Model & Examples

All visuals share two contracts:

### 4.1 ChartSpec

```json
{
  "id": "string",
  "dataset": "events",
  "measures": [
    {
      "id": "occupancy",
      "aggregation": "occupancy_recursion"
    }
  ],
  "dimensions": [
    { "id": "time", "column": "timestamp", "bucket": "5_MIN" }
  ],
  "splits": [
    { "id": "sex", "column": "sex" }
  ],
  "filters": [
    { "logic": "AND", "conditions": [ { "field": "site_id", "op": "equals", "value": "SITE_123" } ] }
  ],
  "timeWindow": { "from": "2024-04-01T00:00:00Z", "to": "2024-04-02T00:00:00Z", "bucket": "5_MIN", "timezone": "Europe/London" },
  "chartType": "area",
  "interactions": { "zoom": true, "hoverSync": true, "seriesToggle": true, "export": ["png", "csv"] },
  "comparison": { "mode": "previous_period", "periodOffset": "P1D" },
  "displayHints": { "carryForward": false }
}
```

* `filters` support nested AND/OR groups; UI exposes this as natural-language pills.
* `splits` are optional; when present, split-specific series are created.
* `timeWindow.bucket` indicates the requested aggregation granularity.

### 4.2 ChartResult

```json
{
  "chartType": "composed_time",
  "xDimension": { "id": "time", "type": "time", "bucket": "5_MIN" },
  "series": [
    {
      "id": "occupancy",
      "label": "Occupancy",
      "axis": "Y1",
      "unit": "people",
      "geometry": "area",
      "data": [ { "x": "2024-04-01T08:00:00Z", "y": 42, "coverage": 1.0 } ]
    }
  ],
  "meta": {
    "bucketMinutes": 5,
    "timezone": "Europe/London",
    "coverage": [ { "x": "2024-04-01T08:00:00Z", "value": 1.0 } ],
    "surges": [ { "x": "2024-04-01T09:30:00Z", "reason": "occupancy_zscore" } ],
    "summary": { "occupancy_max": 120 }
  }
}
```

The frontend renderer consumes only this structure, ensuring parity across contexts.

### 4.3 Fully Worked Examples

#### 4.3.1 Dashboard – Live Flow

*Purpose:* Show live occupancy, entrances, exits, and throughput for the current site in five-minute buckets.

**ChartSpec**

```json
{
  "id": "dashboard-live-flow",
  "dataset": "events",
  "measures": [
    { "id": "occupancy", "aggregation": "occupancy_recursion" },
    { "id": "entrances", "aggregation": "count", "eventTypes": [1] },
    { "id": "exits", "aggregation": "count", "eventTypes": [0] },
    { "id": "throughput", "aggregation": "activity_rate" }
  ],
  "dimensions": [ { "id": "time", "column": "timestamp", "bucket": "5_MIN" } ],
  "filters": [
    { "logic": "AND", "conditions": [
      { "field": "site_id", "op": "equals", "value": "SITE_123" }
    ] }
  ],
  "timeWindow": { "from": "NOW-01:00", "to": "NOW", "bucket": "5_MIN", "timezone": "Europe/London" },
  "chartType": "composed_time",
  "interactions": { "zoom": true, "hoverSync": true, "seriesToggle": true, "export": ["png", "csv"] },
  "displayHints": { "carryForward": true }
}
```

**BigQuery sketch**

```sql
-- filter window to last hour
DECLARE start_ts TIMESTAMP DEFAULT TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR);
DECLARE end_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP();

WITH scoped AS (
  SELECT *
  FROM `nigzsu.<dataset>.events`
  WHERE site_id = @site_id
    AND timestamp BETWEEN start_ts AND end_ts
),
-- occupancy recursion
ordered AS (
  SELECT *,
    SUM(IF(event_type = 1, 1, -1)) OVER (ORDER BY timestamp, index) AS occ_raw
  FROM scoped
),
clamped AS (
  SELECT *, GREATEST(occ_raw, 0) AS occupancy
  FROM ordered
),
by_bucket AS (
  SELECT
    TIMESTAMP_TRUNC(timestamp, MINUTE, 5) AS bucket_start,
    ANY_VALUE(occupancy ORDER BY timestamp DESC, index DESC) AS occupancy_end,
    COUNTIF(event_type = 1) AS entrances,
    COUNTIF(event_type = 0) AS exits,
    COUNT(*) AS activity
  FROM clamped
  GROUP BY bucket_start
),
with_minutes AS (
  SELECT
    bucket_start,
    occupancy_end,
    entrances,
    exits,
    activity,
    GREATEST(5, TIMESTAMP_DIFF(LEAD(bucket_start) OVER (ORDER BY bucket_start), bucket_start, MINUTE)) AS bucket_minutes
  FROM by_bucket
)
SELECT
  bucket_start,
  occupancy_end,
  entrances,
  exits,
  activity,
  activity / NULLIF(bucket_minutes, 0) AS throughput
FROM with_minutes
ORDER BY bucket_start;
```

**ChartResult sketch**

```json
{
  "chartType": "composed_time",
  "xDimension": { "id": "time", "type": "time", "bucket": "5_MIN" },
  "series": [
    { "id": "occupancy", "label": "Occupancy", "axis": "Y1", "unit": "people", "geometry": "area", "data": [...] },
    { "id": "entrances", "label": "Entrances", "axis": "Y2", "unit": "events", "geometry": "column", "stack": "flow", "data": [...] },
    { "id": "exits", "label": "Exits", "axis": "Y2", "unit": "events", "geometry": "column", "stack": "flow", "data": [...] },
    { "id": "throughput", "label": "Throughput", "axis": "Y3", "unit": "events/min", "geometry": "line", "data": [...] }
  ],
  "meta": { "bucketMinutes": 5, "timezone": "Europe/London", "coverage": [...], "surges": [...] }
}
```

#### 4.3.2 Dashboard – Custom Chart (Avg Dwell vs Throughput)

**ChartSpec**

```json
{
  "id": "dashboard-custom-dwell-vs-throughput",
  "dataset": "events",
  "measures": [
    { "id": "avg_dwell", "aggregation": "dwell_mean" },
    { "id": "throughput", "aggregation": "activity_rate" }
  ],
  "dimensions": [ { "id": "time", "column": "timestamp", "bucket": "30_MIN" } ],
  "filters": [
    { "logic": "AND", "conditions": [
      { "field": "site_id", "op": "equals", "value": "SITE_123" },
      { "field": "cam_id", "op": "in", "value": ["041C", "054B"] }
    ] }
  ],
  "timeWindow": { "from": "NOW-07:00", "to": "NOW", "bucket": "30_MIN", "timezone": "Europe/London" },
  "chartType": "dual_axis_time",
  "interactions": { "zoom": true, "hoverSync": true, "axisSwap": true, "export": ["png", "csv"] }
}
```

**SQL sketch:** Extend the dwell `sessions` CTE to include `cam_id` filter, aggregate per 30-minute bucket, join with activity per bucket, compute throughput.

**ChartResult:** `avg_dwell` on `Y1` (minutes, line), `throughput` on `Y2` (events/min, column) with shared x-axis.

#### 4.3.3 Analytics – Demographics (Avg Dwell by Age Bucket & Sex)

**ChartSpec**

```json
{
  "id": "analytics-demographics-dwell-age-sex",
  "dataset": "events",
  "measures": [ { "id": "avg_dwell", "aggregation": "dwell_mean" } ],
  "dimensions": [
    { "id": "age_bucket", "column": "age_bucket" }
  ],
  "splits": [ { "id": "sex", "column": "sex" } ],
  "filters": [
    { "logic": "AND", "conditions": [
      { "field": "site_id", "op": "equals", "value": "SITE_123" },
      { "field": "timestamp", "op": "between", "value": { "from": "2024-03-01T00:00:00Z", "to": "2024-03-31T23:59:59Z" } }
    ] }
  ],
  "timeWindow": { "from": "2024-03-01T00:00:00Z", "to": "2024-03-31T23:59:59Z", "bucket": "NONE", "timezone": "Europe/London" },
  "chartType": "horizontal_bar",
  "interactions": { "seriesToggle": true, "export": ["png", "csv"] }
}
```

**SQL sketch:** Use `sessions` CTE to compute dwell per visit, join demographics from entrance row, group by `age_bucket`, `sex`, compute `AVG(dwell_minutes)`.

**ChartResult:** Two series (male/female) with bars per age bucket, units `minutes` on `Y1`.

#### 4.3.4 Analytics – Patterns Heatmap (Activity by Hour × Weekday)

**ChartSpec**

```json
{
  "id": "analytics-patterns-heatmap-hour-weekday",
  "dataset": "events",
  "measures": [ { "id": "activity", "aggregation": "count" } ],
  "dimensions": [
    { "id": "weekday", "column": "timestamp", "bucket": "WEEKDAY" },
    { "id": "hour", "column": "timestamp", "bucket": "HOUR" }
  ],
  "filters": [
    { "logic": "AND", "conditions": [
      { "field": "site_id", "op": "equals", "value": "SITE_123" },
      { "field": "timestamp", "op": "between", "value": { "from": "2024-03-01T00:00:00Z", "to": "2024-03-30T23:59:59Z" } }
    ] }
  ],
  "timeWindow": { "from": "2024-03-01T00:00:00Z", "to": "2024-03-30T23:59:59Z", "bucket": "NONE", "timezone": "Europe/London" },
  "chartType": "heatmap",
  "interactions": { "hoverSync": true, "export": ["png", "csv"] }
}
```

**SQL sketch:**

```sql
SELECT
  FORMAT_TIMESTAMP('%a', timestamp) AS weekday,
  EXTRACT(HOUR FROM timestamp) AS hour,
  COUNT(*) AS activity
FROM `nigzsu.<dataset>.events`
WHERE site_id = @site_id
  AND timestamp BETWEEN @from AND @to
GROUP BY weekday, hour;
```

**ChartResult:** Heatmap grid with `data` cells containing `{ "x": "Mon", "y": 9, "value": 42 }`; metadata includes global min/max for colour scaling.

#### 4.3.5 Analytics – Retention Curve

**ChartSpec**

```json
{
  "id": "analytics-retention-weekly",
  "dataset": "events",
  "measures": [ { "id": "retention_rate", "aggregation": "retention_curve", "maxLag": 7 } ],
  "dimensions": [
    { "id": "cohort_week", "column": "timestamp", "bucket": "WEEK" }
  ],
  "filters": [
    { "logic": "AND", "conditions": [
      { "field": "site_id", "op": "equals", "value": "SITE_123" },
      { "field": "event_type", "op": "equals", "value": 1 }
    ] }
  ],
  "timeWindow": { "from": "2024-01-01T00:00:00Z", "to": "2024-04-01T00:00:00Z", "bucket": "WEEK", "timezone": "Europe/London" },
  "chartType": "line",
  "interactions": { "hoverSync": true, "seriesToggle": true, "export": ["png", "csv"] }
}
```

**SQL sketch:** Use `visits` and `retention` CTEs from section 3.6. Return rows with `cohort_week`, `lag_weeks`, `return_rate`.

**ChartResult:** One series per cohort week (latest 5 displayed). `Y1` unit `%`. Metadata includes cohort sizes and minimum threshold.

## 5. Backend Architecture & Endpoints (Analytics Service)

### 5.1 Core Flow

1. Frontend assembles a `ChartSpec` (from a preset or builder tweaks).
2. POST `/analytics/run` with the spec and current user context.
3. Backend validates permissions (site access), schema correctness, and guardrails (time window limits).
4. Compiler translates the spec into parameterised BigQuery SQL templates.
5. Execute query via BigQuery client with `job_timeout` safeguards.
6. Post-process results into a canonical `ChartResult`, adding coverage, surge flags, summary stats.
7. Cache normalized results using `(spec_hash, timeWindow)` as key in Redis/Cloud Memorystore with TTL.
8. Return `ChartResult` to frontend. Dashboard and analytics both consume the same response.

### 5.2 Endpoints

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/analytics/run` | POST | Execute a `ChartSpec`, return `ChartResult`. |
| `/analytics/catalogue` | GET | Provide dataset, measure, dimension metadata, supported chart types, default presets. |
| `/analytics/views` | CRUD | Persist user/company saved specs (builder views). |
| `/dashboards` | CRUD | Store dashboard manifests (`WidgetSpec[]`, layout). |
| `/dashboards/:id/widgets` | POST/DELETE | Add/remove pinned charts referencing existing specs or inline spec snapshots. |
| `/exports` | POST | Generate CSV/PNG using stored `ChartResult` or re-run spec. |

All endpoints enforce authentication/authorisation consistent with existing session middleware.

### 5.3 Services & Modules

* **Spec validator:** JSON schema + custom checks (time window limits, measure/dimension compatibility).
* **Spec-to-SQL compiler:** Deterministic translation of measures and dimensions into SQL fragments. Each metric has a dedicated template.
* **BigQuery executor:** Handles retries, rate limits, query options (priority, maximum billing tier).
* **Normalizer:** Converts raw result rows to `ChartResult`, performing unit attachments and metadata calculations.
* **Cache layer:** Wraps BigQuery calls, keyed by hashed spec/time window, invalidated when presets change.
* **Catalogue registry:** Stores preset definitions, measure metadata, and compatibility rules.

### 5.4 Live vs Historical Queries

* `/analytics/run` receives a `timeWindow.live` flag for charts requiring polling (Live Flow). Live queries are limited to last 15 minutes, 5-minute buckets, and run every 60 seconds via frontend polling.
* Historical queries respect cache TTL (10 minutes). Identical specs reuse BigQuery cached results.
* All queries enforce partition predicates (`timestamp BETWEEN @start AND @end`).

### 5.5 Timezone Handling

* Specs include `timeWindow.timezone`.
* Backend converts provided local ranges to UTC before querying.
* ChartResult returns timezone info so the frontend formats axes/tooltips correctly.

## 6. Frontend Architecture: Chart Engine, Dashboard, Analytics Builder

### 6.1 Shared Chart Engine

* Input: `ChartResult`. No other dependencies.
* Output: Recharts/ECharts/Vega-Lite wrapper with consistent theme, multi-axis handling, and interactions.
* Features:
  * Zoom/pan for time charts (brush or wheel).
  * Hover sync across series with tooltip grouping.
  * Series toggles (legend chips) with state persisted per widget.
  * Exports triggered via `/exports` referencing spec hash.
  * Axis manager ensures Y-axes appear only when at least one series binds to them. Units assigned per axis.
  * KPI tiles use same pipeline but render single-value summary with sparkline from ChartResult data.

### 6.2 Dashboard Page

* **Layout (≥1440px width):**
  * KPI band (six tiles) spans full width with responsive wrapping below 1200px.
  * Live Flow card spans two columns beneath KPI band.
  * Custom chart card sits beside Live Flow or below on narrow screens.
* **Data flow:** Widgets defined by backend manifest. Each widget references a `ChartSpec` ID or inline snapshot.
* **Interactions:**
  * Hovering Live Flow displays tooltip with occupancy, entrances, exits, throughput; KPI "Live Occupancy" highlights corresponding value.
  * Clicking KPI opens Analytics → Trends with matching preset and filters applied (deep link containing spec ID).
  * Custom chart gear opens Analytics builder preloaded with that spec.
  * Pinning from Analytics updates dashboard manifest immediately (optimistic UI).

### 6.3 Analytics Workspace

* **Structure:**
  * Left rail (240px, collapsible): Presets grouped by tab; each card shows icon, title, plain-language description.
  * Main canvas: Chart preview with summary pills (Site, Cameras, Time, Split, Measures). Empty state offers recommended presets.
  * Inspector (right panel, 320px; collapses on <1280px): Sections labelled “What data?”, “What are we measuring?”, “How do we break it down?”, “Who’s included?”, “How should it look?”.
* **Interactions:**
  * Selecting a preset immediately loads its ChartResult.
  * Clicking a pill opens the relevant inspector section (e.g., "Time: Last 30 days" opens time range picker).
  * Filter builder uses natural-language chips (“Include site HQ01”, “Cameras 041C, 054B”). Users add conditions via guided dropdowns.
  * Builder always operates on a valid spec; users never see raw JSON.
  * Gear menu (on each preview) offers Duplicate, Save View, Pin to Dashboard, Download.

## 7. Persistence Model: Views, Dashboard Pins, Sharing

* **ViewSpec:** `{ id, ownerId, orgId, name, description, chartSpec, createdAt, updatedAt, visibility }`. Stored server-side via `/analytics/views`.
* **Dashboard manifest:** `{ id, orgId, widgets: WidgetSpec[], layout: LayoutSpec, theme: 'dark' }` where `WidgetSpec = { id, title, chartSpecId | inlineSpec, defaultInteractions }`.
* **Sharing:** Views can be marked org-shared; dashboard manifests scoped to org but can support per-role overrides later.
* **Pinning flow:**
  1. User clicks “Pin to dashboard” in analytics.
  2. Frontend POSTs widget spec referencing chartSpec ID to `/dashboards/:id/widgets`.
  3. Backend persists layout and returns updated manifest.
  4. Dashboard queries manifest on load and renders via chart engine.
* **No localStorage** for persistent state except cached UI preferences (e.g., theme toggle).

## 8. Testing & Validation Plan

### 8.1 Backend

* Unit tests for each metric SQL template using BigQuery dry-run validation.
* Integration tests executing against golden datasets and comparing JSON outputs with expected fixtures.
* Contract tests ensuring `/analytics/run` rejects invalid specs, enforces guardrails, and returns consistent `ChartResult` schema.
* Invariant checks executed post-query (occupancy deltas, split totals).

### 8.2 Frontend

* Storybook stories covering KPI tiles, Live Flow, demographics bars, heatmaps, retention lines using fixture `ChartResult` data.
* Jest/React Testing Library tests verifying KPI values equal chart aggregates via shared selectors.
* Cypress smoke tests covering preset selection, pill editing, saving views, pinning to dashboard.
* Accessibility tests (axe) for dashboard and analytics flows.

### 8.3 Manual QA

* Compare dashboard KPIs with exported CSV from `/exports`.
* Scenario scripts: e.g., "Site HQ01 had a promotion on Friday" – ensure surge flags appear and heatmap reflects traffic spike.
* Visual QA against reference inspiration (spacing, typography, interactions).

## 9. Phased Implementation Roadmap

Each phase has explicit deliverables and ticket-ready tasks. Phases must be completed sequentially; later phases depend on earlier outputs.

### Phase 1 – Specification & Metric Foundations

**Deliverables**

* Finalized `ChartSpec` & `ChartResult` JSON schemas (TypeScript types + JSON Schema docs).
* SQL template documents for occupancy, activity, throughput, dwell, demographics, retention.
* Partition/cluster validation of BigQuery table.
* Golden dataset fixtures and expected outputs.
* Schema validation tests running in CI.

**Done criteria**

* Schemas reviewed and versioned.
* Golden dataset queries return expected JSON.
* Metric definitions signed off by product & data stakeholders.

**Ticket skeleton**

1. Draft `ChartSpec` schema (TS + JSON Schema).
2. Draft `ChartResult` schema (TS + JSON Schema).
3. Validate BigQuery table partitioning/cluster assumptions; create views if missing.
4. Implement SQL templates for occupancy/activity/throughput.
5. Implement SQL templates for dwell/demographics/retention.
6. Create golden dataset fixtures in BigQuery.
7. Generate expected JSON outputs from fixtures.
8. Implement schema validation tests (spec + result).

### Phase 2 – Backend Analytics Engine on BigQuery

**Deliverables**

* Spec-to-SQL compiler service.
* `/analytics/run` endpoint returning real BigQuery results.
* Result normaliser with coverage & surge metadata.
* `/analytics/catalogue` endpoint.
* Caching layer based on spec hash.
* Backend test suite running against fixtures.

**Done criteria**

* Running spec from preset catalogue returns correct `ChartResult`.
* Cache hits visible for repeated identical specs.
* Coverage metadata populates charts for fixture datasets.

#### Phase 2 — Current Implementation Status (Mid-Phase Checkpoint)

**Delivered**

* Shared canonical bucket calendar
* Full occupancy recursion pipeline
* Exit-first handling
* Forward-fill logic
* Unified coverage computation
* Unified `rawCount`, unit, label metadata
* Full string operator support
* Updated fixtures + golden examples
* Dwell metric pipeline
* Retention metric pipeline

**Not Delivered Yet**

* Live BigQuery execution
* Any dashboard/UI integration
* Any chart-engine integration
* Any caching beyond local process

**Intentional UI-facing behaviours**

* Occupancy buckets seeded only by exits retain the carried-forward value while reporting coverage ≤ 0.5; treat these points as low-confidence in the UI.
* Dwell buckets with zero sessions emit `value = null` alongside `rawCount = 0`, signalling an explicit gap that frontend charts should display as missing rather than interpolated.
* Retention heatmap cells scale coverage by cohort size versus `_RETENTION_MIN_COHORT` (100); small cohorts therefore surface as low-coverage even when retention rates are high.

**Phase 2 finalisation items (pre-Phase 3 must-haves)**

* Wire live BigQuery execution using the approved service account and confirm fixture parity in `pytest backend/tests/test_analytics_bigquery.py`.
* Expose `/analytics/run` (and `/analytics/catalogue`) so frontend clients can request `ChartResult` payloads over HTTP.
* Prepare the cache abstraction for a production backend (Redis adapter + configuration knobs) without altering key semantics.
* Lock the canonical bucket calendar configuration (bucket sizing, timezone handling, coverage semantics) so Phase 3+ consumers can depend on it.

Phase 2 compiler currently runs fully against test fixtures. Live BigQuery execution for occupancy/activity/throughput will be implemented in the next Phase 2 iteration.

#### ChartResult contract for frontend & chart engine (applies from Phase 3 onward)

**Series structure**

* Every chart response contains `series: Series[]`; each `Series` has `id`, `label`, `unit`, `geometry`, `axis`, `points`, and optional `meta`.
* `geometry` is one of `"line"`, `"column"`, `"area"`, `"heatmap"`, or `"stat"`, steering default rendering in the shared chart engine.
* `axis` references either `"primary"`, `"secondary"`, or a named heatmap axis (`"rows"`, `"columns"`).

**Point schema**

* Time/ordinal points: `{ "bucket": ISO8601 timestamp, "value": number|null, "rawCount": number|null, "coverage": number, "surge": SurgeMeta|null }`.
* Heatmap points: `{ "row": string, "column": string, "value": number|null, "rawCount": number|null, "coverage": number }`.
* `coverage` is always between 0 and 1 and must be shown in tooltips/legends; `null` values indicate intentional gaps (never extrapolate client-side).
* `rawCount` represents the unnormalised count (sessions, events, visitors); treat as required for analytics builder summaries.

**Axes & units**

* Primary axis defaults to the first quantitative series; secondary axes must be declared explicitly in the spec (e.g., throughput vs. occupancy).
* Units are human-friendly strings (`"people"`, `"events"`, `"events/min"`, `"minutes"`, `%`) and should drive tick formatting and tooltip suffixes.

**Canonical timelines**

* Occupancy, activity, throughput, and dwell reference the shared `calendar` CTE and therefore return identical bucket boundaries for the same spec window.
* Retention heatmaps return a cohort/lag grid with no missing cells; axis ordering is deterministic (cohort ascending, lag ascending).
* Buckets are never omitted. Leading/trailing partial buckets surface lower coverage but remain present so frontend zoom/brush interactions stay aligned.

**Metadata guarantees**

* `metadata.coverageSummary` (if present) summarises the lowest coverage bucket; retain in cards/tooltips.
* Surge metadata (when implemented) attaches to points via `surge` with `{ "kind": "surge"|"drop", "strength": number }`.
* No field names, label text, or unit tokens will change without an explicit breaking-change note; treat this section as the binding contract for Phase 3+.
* The backend analytics contract is now considered frozen for Phase 3 development; any divergence must go through the change-control log before implementation.

**Ticket skeleton**

1. Implement spec → SQL compiler core.
2. Implement BigQuery execution client with guardrails.
3. Implement `/analytics/run` endpoint.
4. Implement spec validation middleware.
5. Implement result normaliser (series assembly, units, metadata).
6. Add coverage & surge calculations to normaliser.
7. Implement caching (hash(spec + timeWindow)).
8. Implement `/analytics/catalogue` endpoint (static data for now).
9. Add golden dataset regression tests in CI.

### Phase 3 – Shared Chart Engine in Frontend

**Deliverables**

* Reusable chart renderer component with theme + interaction services.
* Axis manager for multi-axis bindings.
* Card chrome & layout primitives (dark theme, responsive spacing).
* KPI tile component powered by `ChartResult`.
* Export service integrated with backend `/exports`.
* Storybook coverage.

**Done criteria**

* Live Flow, demographics bars, heatmap, retention charts render accurately using fixture data.
* Exports triggered from preview download identical data to visible chart.
* Accessibility baseline (axe) passes for chart components.

**Ticket skeleton**

1. Build unified chart renderer (time/bar/heatmap support).
2. Implement multi-axis manager.
3. Build reusable card chrome with header, actions, gear menu.
4. Implement KPI tile component + sparkline.
5. Implement export service wiring to backend.
6. Add Storybook stories for core chart types.
7. Run accessibility baseline and fix blockers.

### Phase 4 – Analytics Builder & Presets

**Deliverables**

* New analytics workspace shell (rail + canvas + inspector).
* Preset galleries per tab with descriptions.
* Filter pill builder with natural-language chips.
* Saved View CRUD UI.
* Gear menu actions (duplicate, save, pin).
* Removal of legacy tree-based builder.

**Done criteria**

* User can open preset, tweak filters, save view, pin to dashboard.
* All presets map to defined ChartSpecs and execute successfully.
* Legacy builder code removed.

**Ticket skeleton**

1. Create analytics workspace layout (rail/canvas/inspector).
2. Implement preset gallery components (Trends, Demographics, Patterns, Retention).
3. Implement catalogue rail fetching from `/analytics/catalogue`.
4. Implement chart canvas with summary pills & empty state guidance.
5. Implement gear menu with actions.
6. Implement inspector panels for Sites/Measures/Splits/Filters/Display.
7. Implement filter pill builder with nested logic support.
8. Implement Saved View CRUD integration.
9. Remove legacy builder UI and routes.

### Phase 5 – Dashboard Refactor & Pinning

**Deliverables**

* Dashboard loads from backend manifest.
* KPI band powered by specs with guarantees enforced.
* Live Flow chart uses shared engine.
* Custom chart cards reference saved specs.
* Pin-to-dashboard flow implemented end-to-end.
* Responsive layout replacing fixed grid.
* Removal of localStorage pin hacks.

**Done criteria**

* Dashboard renders solely from backend data.
* Pinning a chart from analytics updates dashboard in same session and after reload.
* KPIs match analytics totals within tolerance.

**Ticket skeleton**

1. Implement dashboard manifest fetch & render.
2. Replace KPI tiles with spec-driven components.
3. Integrate Live Flow spec with shared chart engine.
4. Implement custom chart card referencing saved specs.
5. Implement pin-to-dashboard API flow & optimistic UI.
6. Implement responsive dashboard grid layout.
7. Remove localStorage persistence & legacy hooks.

### Phase 6 – QA, Performance, & Polish

**Deliverables**

* BigQuery cost/performance monitoring dashboards.
* Load tests for peak usage scenarios.
* Surge detection tuning & alert thresholds validated.
* Final accessibility audit.
* Theming, spacing, typography refinements to match premium references.
* Final sign-off demo with stakeholders.
* Removal of deprecated code paths.

**Done criteria**

* BigQuery queries stay within latency targets.
* Accessibility AA compliance verified.
* Stakeholders approve final UI & data accuracy.

**Ticket skeleton**

1. Execute BigQuery performance profiling & caching adjustments.
2. Run load tests on `/analytics/run` & dashboard flows.
3. Tune surge detection thresholds & document outcomes.
4. Conduct full accessibility audit & remediate.
5. Polish theme (colours, spacing, typography) across dashboard & analytics.
6. Prepare and deliver final stakeholder demo.
7. Remove deprecated code paths & feature flags.

## 10. Preset Catalogue & Chart Library

The platform ships with opinionated presets per surface. Each preset is editable; users start from them and adjust via the builder.

### 10.1 Dashboard Presets

| Name | Description | Default Placement | ChartSpec Summary |
| --- | --- | --- | --- |
| **Live Flow (last 60 min)** | “How many people are inside right now and how fast are they moving?” | Dashboard main chart | `measures=[occupancy, entrances, exits, throughput]`, `bucket=5_MIN`, `timeWindow=NOW-1H→NOW`, site filter from user context. |
| **Entrances & Exits Today** | “How many people have come in/out today?” | KPI drill (link from tile) | `measures=[entrances, exits]`, `bucket=HOUR`, `timeWindow=local midnight→now`. |
| **Avg Dwell vs Throughput (today)** | “Are visitors lingering or churning quickly today?” | Custom card | `measures=[avg_dwell, throughput]`, `bucket=30_MIN`, selected cameras. |
| **Occupancy Snapshot (last 2 hours)** | “When were we busiest in the last 2 hours?” | Optional dashboard card | `measures=[occupancy_max]`, `bucket=15_MIN`, highlight surge flags. |

### 10.2 Analytics → Trends Presets

| Name | Description | ChartSpec Highlights |
| --- | --- | --- |
| **Footfall by day (last 30 days)** | Daily entrances+exits trend. | `measures=[activity_total]`, `bucket=DAY`, `timeWindow=30 days`, site-level filter. |
| **Peak hourly occupancy (last 7 days)** | Track highest occupancy per hour. | `measures=[occupancy_max]`, `bucket=HOUR`, `timeWindow=7 days`, optional camera split. |
| **Throughput by hour (last 24 hours)** | Activity rate per hour. | `measures=[throughput]`, `bucket=HOUR`, `timeWindow=24 hours`. |
| **Entrances vs exits (last 14 days)** | Balance between inflow/outflow. | `measures=[entrances, exits]`, `bucket=DAY`, `timeWindow=14 days`. |

### 10.3 Analytics → Demographics Presets

| Name | Description | ChartSpec Highlights |
| --- | --- | --- |
| **Entrances by age band & sex (last 30 days)** | Understand visitor mix. | `measures=[entrances]`, `dimensions=[age_bucket]`, `splits=[sex]`, `timeWindow=30 days`. |
| **Avg dwell by age band (last 30 days)** | See which age groups linger. | `measures=[avg_dwell]`, `dimensions=[age_bucket]`, `timeWindow=30 days`. |
| **Visitor mix (age/sex distribution)** | Pie chart of visits. | `measures=[entrances]`, `dimensions=[age_bucket]`, `splits=[sex]`, `chartType=stacked_bar/pie`. |

### 10.4 Analytics → Patterns Presets

| Name | Description | ChartSpec Highlights |
| --- | --- | --- |
| **Heatmap: activity by hour × weekday (last 30 days)** | Spot busy windows. | `measures=[activity_total]`, `dimensions=[weekday, hour]`. |
| **Occupancy by day of week** | Compare weekly patterns. | `measures=[occupancy_mean]`, `dimensions=[weekday]`, `chartType=line`. |
| **Busy vs quiet hours (top 5)** | Identify top/bottom hours. | `measures=[activity_total]`, `dimensions=[hour]`, `sort=desc`, limit 5. |

### 10.5 Analytics → Retention Presets

| Name | Description | ChartSpec Highlights |
| --- | --- | --- |
| **Weekly retention curve (entrance visitors)** | Standard cohort retention. | `measures=[retention_rate]`, `dimensions=[cohort_week]`, `maxLag=7`. |
| **Returning within 7 days** | Quick re-visit rate. | `measures=[return_rate_7d]`, derived from retention base. |
| **Returning within 30 days** | Long-term loyalty. | `measures=[return_rate_30d]`, aggregated from retention matrix. |

All preset specs live in the catalogue and power both analytics galleries and dashboard defaults.

## 11. Dashboard KPI Definitions & Guarantees

| KPI | Time Window | Formula | Guarantees |
| --- | --- | --- | --- |
| **Activity (Total Traffic)** | Today (local midnight → now) | `COUNTIF(event_type IN (0,1))` across all selected cameras. | Matches sum of “Footfall by day” chart for today when filters align. |
| **Entrances Today** | Today (local midnight → now) | `COUNTIF(event_type = 1)` across selected cameras. | Equals sum of entrances in equivalent Trends chart. |
| **Exits Today** | Today (local midnight → now) | `COUNTIF(event_type = 0)` across selected cameras. | Equals sum of exits in equivalent Trends chart. |
| **Live Occupancy** | Latest 5-minute bucket in Live Flow chart. | Last occupancy value from Live Flow `ChartResult`. | KPI value must equal final point in Live Flow series. |
| **Avg Dwell (Today)** | Today (local midnight → now) | Mean dwell minutes of paired sessions starting today. | Matches average shown when building a Trends dwell chart for same filters/time. |
| **Freshness Status** | Current moment | `NOW() - MAX(timestamp)` for selected site. | KPI states: Green ≤2 min, Amber >2 & ≤10 min, Red >10 min. Live Flow tooltip shows identical timestamp. |

QA must verify KPI ≈ chart totals (within rounding) for any matching spec.

## 12. UX & Interaction Specification (Dashboard + Analytics)

### 12.1 Dashboard UX

* **Layout (1440px):**
  * KPI band: six cards (Activity, Entrances, Exits, Live Occupancy, Avg Dwell, Freshness). Cards sized 220×120px, spaced 16px, wrap to two rows below 1200px.
  * Live Flow card: full-width (two-column span), height 400px, sits beneath KPI band.
  * Custom chart card: right column (if screen ≥1440px) or stacked below Live Flow on smaller widths.
* **Interactions:**
  * Hovering Live Flow: tooltip shows `time`, `occupancy`, `entrances`, `exits`, `throughput`, coverage note. KPI Live Occupancy highlights simultaneously.
  * Clicking Activity/Entrances/Exits KPIs: deep links to Analytics → Trends preset with identical filters/time; modal hint explains transition.
  * Clicking Avg Dwell: opens Analytics → Trends with dwell preset.
  * Clicking Freshness: displays modal with last event timestamp, recommended actions.
  * Gear on Custom chart: opens Analytics builder preloaded with underlying spec; after editing, user can re-save/pin.
* **Empty state:** Dashboard never empty—if backend returns no data, cards show `--` with tooltip explaining “No events recorded today. Check camera status.”

### 12.2 Analytics UX (Kid-level simplicity)

* **Landing:** User sees tab-specific preset tiles with large titles (“How busy am I by day?”). Clicking a tile instantly loads the chart and summary pills.
* **Summary pills:** e.g., “Site: HQ01”, “Cameras: All”, “Time: Last 30 days”, “Split: age_bucket”. Clicking a pill opens a simple dialog: e.g., "Choose site" with search + checkboxes.
* **Inspector language:**
  * "What data?" – Site & camera selectors with plain sentences (“You’re looking at HQ01 · Cameras 041C, 054B”).
  * "What are we measuring?" – Toggle buttons for measures (Occupancy, Entrances, Exits, Avg dwell).
  * "How do we break it down?" – Time granularity (5 min, 15 min, hour, day) and splits (sex, age bucket, camera).
  * "Who’s included?" – Demographic filters with checkboxes.
  * "How should it look?" – Chart type icons (line, area, bars, heatmap).
* **Editing flow:**
  * To change time range, click "Time: Last 30 days" pill → choose “Last 7 days”. Chart updates live.
  * To split by sex, click "Split" area → toggle `Sex` on. Chart redraws with male/female series.
  * To pin: click gear → “Pin to dashboard” → choose slot → success toast.
* **Safeguards:**
  * Builder never shows invalid states; incompatible combinations (e.g., heatmap + dwell) display tooltip explaining why.
  * Clear undo/redo for recent changes.

## 13. Modularity & Reuse Principles

* Every visualization is defined solely by a `ChartSpec` and rendered from a `ChartResult`.
* Dashboard Live Flow is a preset spec; the chart engine treats it the same as any analytics chart.
* Presets are stored specs; editing a preset clones the spec into a view.
* KPI tiles derive from specs returning single-value summaries; no special-case code.
* Adding a new chart means adding a spec to the catalogue and (optionally) a preset card. No renderer changes required.
* Shared tooling (tooltips, legends, exports) operate only on `ChartResult`, ensuring consistent behaviour across surfaces.

## 14. Migration from Current Implementation

* **Fully replaced:**
  * React hooks computing analytics (`useChartData`, etc.).
  * LocalStorage-based pins/saved views.
  * Legacy analytics builder (filter tree UI, static enums).
  * Inline layout components with fixed rails.
* **Adapted:**
  * Routing shells (`DashboardPage`, `AnalyticsPage`) remain but render new components.
  * Existing authentication/session flow reused.
  * Theme tokens extended for new palette.
* **Strategy:**
  * Phase-gate new backend behind feature flag (`analytics_v2`).
  * Launch analytics workspace first (Phase 4) while dashboard still shows legacy data; pinning disabled until Phase 5.
  * Once dashboard refactored, remove flag and delete legacy code paths.
  * Ensure legacy URLs redirect to new presets (mapping table).
* **Danger zones:**
  * Cached localStorage data must be ignored/cleared to prevent conflicting state.
  * Communicate data recalculations with stakeholders; expect differences due to corrected math.

## 15. BigQuery Performance & Cost Guardrails

* **Time window limits:**
  * Live charts: max 15 minutes with 5-minute buckets.
  * Trends: ≤30 days with 15-minute buckets; 30–180 days enforce ≥1-hour buckets; >180 days enforce daily buckets and display sampling note.
  * Retention: max 6 months of cohorts.
* **Latency targets:**
  * Dashboard live queries median ≤1.5 s.
  * Analytics queries median ≤3 s for standard presets; ≤5 s for retention.
* **Cost controls:**
  * Always filter by partitioned date range.
  * Reject specs without site filters unless user has multi-site permissions.
  * Detect excessively broad requests and prompt user to narrow scope.
  * Consider precomputed materialized views for long-range Trend presets if cost spikes.
  * Monitor BigQuery slot usage; enable storage read cache and BI Engine if necessary.

## 16. Implementation Status & Checklist (Codex Must Maintain This Section During Development)

Codex: This section is for YOU to update as you deliver features.
Do NOT alter earlier sections unless explicitly instructed.
Only update the checkboxes + notes.

### 16.1 Phase Checklist (Top-Level)

- [x] Phase 1 – Specification & Metric Foundations *(completed; SQL template narratives intentionally move to Phase 2 to align with compiler implementation)*
- [ ] Phase 2 – Backend Analytics Engine on BigQuery
- [ ] Phase 3 – Shared Chart Engine in Frontend
- [ ] Phase 4 – Analytics Builder & Presets
- [ ] Phase 5 – Dashboard Refactor & Pinning
- [ ] Phase 6 – QA, Performance, & Polish

### 16.2 Detailed Task Checklist by Phase

**Phase 1 – Specification & Metric Foundations**

- [x] Draft ChartSpec schema *(TS + JSON Schema committed in `shared/analytics/schemas` with mirrored types in `frontend/src/analytics/schemas/charting.ts` and validated by `backend/tests/test_chart_schemas.py`)*
- [x] Draft ChartResult schema *(same locations/tests as above)*
- [x] Validate BigQuery table structure *(see `backend/app/analytics/schema_validator.py` + `backend/tests/test_schema_validator.py`; supports per-client tables with canonical schema enforcement)*
- [ ] Implement SQL templates (occupancy, throughput, dwell, demographics, retention) *(scheduled to ship alongside the Phase 2 spec→SQL compiler)*
- [x] Create golden dataset fixtures *(`shared/analytics/fixtures/events_golden_client0.csv` with workflow documented in `docs/analytics/foundations.md`)*
- [x] Create expected JSON outputs *(generated via `backend/app/analytics/generate_expected.py`, stored under `shared/analytics/examples`)*
- [x] Implement schema validation tests *(pytest suite in `backend/tests` covers schemas, fixtures, and validator behaviour)*

Notes:

- Canonical schema + fixtures documented in `docs/analytics/foundations.md`; README links added in `README.md`.
- SQL template narratives intentionally deferred to Phase 2 so that documentation and implementation land together with the spec→SQL compiler.

### Phase 1 Delivered

- Canonical `ChartSpec` & `ChartResult` JSON Schemas stored in `shared/analytics/schemas/`, validated by Python (`backend/app/analytics/contracts.py`) and TypeScript (`frontend/src/analytics/schemas/charting.ts`) runtimes.
- Deterministic golden fixture CSV (`shared/analytics/fixtures/events_golden_client0.csv`) with regeneration utilities in `backend/app/analytics/fixtures.py` and `backend/app/analytics/generate_expected.py`.
- Golden `ChartResult` examples for regression protection in `shared/analytics/examples/`.
- BigQuery per-client table schema validator (`backend/app/analytics/schema_validator.py`) confirming canonical columns, UTC timestamps, and client-specific routing without hard-coding table names.
- Analytics foundations documentation (`docs/analytics/foundations.md`) detailing schema rules, fixture workflow, validation commands, and the Phase 2 execution outline.
- UTC-only timestamp assumption documented and validated across fixtures and schemas; no local-time conversions yet required.
- Phase 1 delivered backend/infrastructure groundwork only; the live dashboard and analytics UI remain unchanged.
- Repository ready for Phase 2: next steps cover spec→SQL compiler, `/analytics/run`, result normalisation, cache abstraction, and BigQuery integration/validation against client tables.

**Handover for next Codex:** Phase 1 assets live in `shared/analytics/schemas/`, `shared/analytics/examples/`, `shared/analytics/fixtures/`, and `docs/analytics/foundations.md` for immediate reuse.

**Phase 2 – Backend Analytics Engine**

- [ ] Implement spec → SQL compiler
- [ ] Implement /analytics/run endpoint
- [ ] Implement spec validation
- [ ] Implement BigQuery execution
- [ ] Implement result normalisation
- [ ] Add coverage + surge metadata
- [ ] Implement caching (hash(spec + timeWindow))
- [ ] Implement /analytics/catalogue
- [ ] Add golden dataset tests

Notes:

...

**Phase 3 – Shared Chart Engine**

- [ ] Build unified chart renderer
- [ ] Implement multi-axis manager
- [ ] Build reusable card chrome
- [ ] Implement KPI tiles
- [ ] Implement export service
- [ ] Add Storybook stories
- [ ] Accessibility baseline passed

Notes:

...

**Phase 4 – Analytics Builder & Presets**

- [ ] Create analytics workspace
- [ ] Implement preset galleries (Trends, Demographics, Patterns, Retention)
- [ ] Implement catalogue rail
- [ ] Implement chart canvas with summary pills
- [ ] Implement gear menu
- [ ] Implement inspector panels (Sites / Measures / Splits / Filters / Display)
- [ ] Implement filter-pill builder
- [ ] Implement Saved View CRUD
- [ ] Remove legacy builder

Notes:

...

**Phase 5 – Dashboard Refactor**

- [ ] Dashboard loads from backend layout manifest
- [ ] KPI band powered by spec
- [ ] Live Flow based on chart engine
- [ ] Custom chart cards
- [ ] Implement pin-to-dashboard
- [ ] Responsive layout
- [ ] Remove localStorage pins

Notes:

...

**Phase 6 – QA & Polish**

- [ ] BigQuery performance testing
- [ ] Load testing
- [ ] Surge detection tuning
- [ ] Full a11y audit
- [ ] UI refinement (theme, spacing, typography)
- [ ] Final sign-off demo
- [ ] Remove legacy codepaths

Notes:

...

### 16.3 High-Quality Dashboard Visual & UX Checklist

- [ ] Color, spacing, typography consistent
- [ ] KPI tiles polished
- [ ] Chart colours readable
- [ ] “Preset first, tweak second” UX
- [ ] Child-level simplicity across builder
- [ ] Zero hard-coded charts
- [ ] All charts spec-driven
- [ ] Smooth zoom/hover sync
- [ ] Exports reflect current state
- [ ] Live updates smooth

Notes:

...
