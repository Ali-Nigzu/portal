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

#### Phase 2 completion summary (locked for frontend consumption)

🏁 **Phase 2 complete – backend analytics foundation frozen for frontend consumption.**

**Delivered assets (ready for Phase 3 integration):**

* [`backend/app/analytics/compiler.py`](backend/app/analytics/compiler.py) – canonical spec→SQL compiler covering occupancy, activity, throughput, dwell, and retention pipelines with the shared calendar.
* [`backend/app/analytics/engine.py`](backend/app/analytics/engine.py) – execution harness, normaliser, coverage/rawCount enrichment, and cache orchestration.
* [`backend/app/analytics/cache.py`](backend/app/analytics/cache.py) & [`backend/app/analytics/hashing.py`](backend/app/analytics/hashing.py) – deterministic spec hashing plus pluggable cache backend (in-process TTL default).
* [`shared/analytics/fixtures/events_golden_client0.csv`](shared/analytics/fixtures/events_golden_client0.csv) & [`backend/app/analytics/fixtures.py`](backend/app/analytics/fixtures.py) – golden fixture inputs that mirror production schemas.
* [`shared/analytics/examples/chartresult_phase2_example.json`](shared/analytics/examples/chartresult_phase2_example.json) – frozen ChartResult example for frontend QA and Storybook fixtures.
* [`handover/Phase2_Handover.md`](handover/Phase2_Handover.md) – operational runbook covering compiler usage, regression commands, fixture locations, and UI semantics that Phase 3 must honour.

**Pending for Phase 2.2 (live BigQuery wiring follow-up):**

* Connect analytics execution to production BigQuery datasets via the approved service account, validating parity with fixtures.
* Expose `/analytics/run` and `/analytics/catalogue` HTTP endpoints that proxy the compiler/engine outputs.
* Introduce a production-ready cache backend (Redis or equivalent) once live execution is validated.
* Preserve fixture-based regression tests to guarantee no drift between sandbox datasets and compiled SQL results.

The backend contract (spec schemas, ChartResult fields, calendar semantics, coverage/rawCount behaviour) is now considered frozen for Phase 3. Any deviations require explicit change-control notes before implementation.

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

### Phase 3 – Shared Frontend Chart Engine & Card Primitives

**What Phase 3 is**

Phase 3 is **the construction of the shared frontend chart engine and card primitives that will power the Dashboard (Phase 5) and the Analytics Builder workspace (Phase 4).** This phase produces the reusable visual foundation only. It does **not** modify any existing client-facing pages; instead it builds the core visual engine that every future surface will consume. All components must ingest `ChartResult` objects exactly as emitted in Phase 2.

#### Phase 3 deliverables

**A. Declarative `<ChartRenderer>` core**

* The orchestrator in `frontend/src/analytics/components/ChartRenderer/ChartRenderer.tsx` renders purely declaratively: it receives a `ChartResult`, inspects `chartType` plus `series[].geometry`, and selects the matching primitive without performing any metric-specific maths, bucket interpolation, or value coercion.
* Contract enforcement lives in `validation.ts`. Invalid payloads surface `ChartErrorState` (friendly card treatment) while empty/fully-null payloads surface `ChartEmptyState`; both reside in `ui/` alongside shared legend and tooltip components.
* Required primitives (under `primitives/`) ship as first-class modules:
  1. `TimeSeriesChart.tsx` – occupancy, entrances, exits, throughput, dwell (mean/p90), and activity series.
  2. `FlowChart.tsx` – composed area+bar+line Live Flow configuration with mixed-unit handling.
  3. `BarChart.tsx` – categorical/demographic splits.
  4. `HeatmapChart.tsx` – retention cohort grids and future density/activity matrices with canonical row × column grids.
  5. `KpiTile.tsx` – single-value KPI tiles with trend arrow, coloured delta, optional sparkline, coverage + rawCount surfacing.
* Rendering foundation remains Recharts; all primitives pass through canonical `ChartResult` metadata (`coverage`, `rawCount`, labels, units) untouched.

**B. Axis, series, and palette management**

* `managers/AxisManager.ts` groups series strictly by unit (`people`, `events`, `events/min`, `minutes`, `percentage`, `count`), auto-hides unused axes, and caps charts at **three** Y-axes with labels mirroring the unit token.
* `managers/PaletteManager.ts` and `managers/SeriesManager.ts` provide deterministic colour assignments (occupancy blue, entrances green, exits red, dwell gold) and toggle state tracking shared across all primitives.

**C. Interaction UI & formatting utilities**

* `ui/SeriesLegend.tsx` offers keyboard-accessible series toggles that respect backend ordering and dynamically update axis visibility.
* `ui/ChartTooltip.tsx` (paired with `utils/format.ts` and `primitives/utils.ts`) renders unit-formatted values, `rawCount` (when meaningful), and coverage labels that highlight low-confidence (`coverage < 1`) and critical (`coverage < 0.5`) states without re-ordering payloads.
* Time-series/flow charts expose zoom via Recharts `Brush`; heatmaps explicitly disable zoom/pan per requirements.

**D. Card chrome & KPI primitives**

* `components/Card/Card.tsx` + `Card.css` provide the universal chrome (title, subtitle, settings, export, placeholder date selector, tag area) with responsive spacing and light/dark theming via existing design tokens.
* `primitives/KpiTile.tsx` handles unit-aware big numbers, delta arrows (↑/↓/→), coloured deltas (green/red/neutral), optional sparklines, `rawCount`, and low-coverage messaging – forming the foundation for dashboard KPI cards.

**E. Storybook visual QA matrix**

* `frontend/src/analytics/stories/ChartRendererPlayground.stories.tsx` is the authoritative visual suite. It loads golden fixtures through `utils/loadChartFixture.ts`, applies lightweight transforms for edge cases, and showcases:
  - Occupancy/activity/throughput multi-series time chart (low coverage included).
  - Live Flow composite (area + bar + line).
  - Dwell mean + p90 with null buckets and low coverage.
  - Retention heatmap with small-cohort coverage warnings.
  - Demographic split bars.
  - KPI tile variants (positive delta, negative delta, null value, low coverage).
  - Empty/no-data state and contract violation state (error surface).
* A dedicated command `npm --prefix frontend run charts:preview` boots Storybook with fixtures for local QA.

**F. Export stub & fixture loaders**

* `utils/exportChart.ts` packages `{ spec, specHash }` and posts to `/api/analytics/export-placeholder`, matching the Phase 6 backend contract.
* `utils/loadChartFixture.ts` exposes typed dynamic imports of the golden JSON fixtures in `shared/analytics/examples/` for Storybook and local harness usage.

**G. Developer experience & testing**

* Documented workflows now include `npm --prefix frontend run charts:preview`, `npm --prefix frontend run lint`, and targeted Jest runs for chart utilities.
* Unit coverage: `primitives/utils.ts` (via usage), AxisManager tests (`components/ChartRenderer/__tests__/AxisManager.test.ts`), and validation contract tests (`components/ChartRenderer/__tests__/validation.test.ts`).
* `handover/Phase2_Handover.md` references the new directories, fixtures, scripts, and testing guidance so future Codex engineers can onboard rapidly.

**H. Visual semantics & accessibility guardrails**

* All typography/spacing/colour decisions consume existing VRM design tokens (`--vrm-*`). Legends wrap gracefully, tooltips/coverage badges signal low confidence, and coverage below 0.5 receives critical styling across charts and KPI tiles.
* `rawCount` values surface when provided; null values render as intentional gaps (no interpolation). Heatmap cells highlight missing data rather than inferring values.
* Error/empty states are card-based, maintain layout stability, and avoid crashing downstream surfaces.

**I. File layout summary**

```
frontend/src/analytics/
  components/
    Card/
      Card.tsx
      Card.css
      index.ts
    ChartRenderer/
      ChartRenderer.tsx
      index.ts
      managers/
        AxisManager.ts
        PaletteManager.ts
        SeriesManager.ts
        index.ts
      primitives/
        BarChart.tsx
        FlowChart.tsx
        HeatmapChart.tsx
        KpiTile.tsx
        TimeSeriesChart.tsx
        index.ts
        types.ts
        utils.ts
      ui/
        ChartErrorState.tsx
        ChartEmptyState.tsx
        ChartTooltip.tsx
        SeriesLegend.tsx
      utils/
        format.ts
      styles.css
      validation.ts
  stories/
    ChartRendererPlayground.stories.tsx
  utils/
    exportChart.ts
    loadChartFixture.ts
```

* Components follow PascalCase naming; utilities camelCase. Types flow from `frontend/src/analytics/schemas/charting.ts`.

#### Chart engine architecture (Phase 3)

```
Phase 2 backend
   │
   │  (ChartResult JSON)
   ▼
ChartRenderer orchestrator
   │
   ├─ validation.ts ──► error / empty state surfaces
   ├─ AxisManager ──► Recharts axes (unit-based)
   ├─ Palette/Series managers ─► colour + visibility
   ├─ UI helpers ─────► tooltips, legends, formatting
   └─ Primitives ───► TimeSeries / Flow / Bar / Heatmap / KPI
                           │
                           ▼
                    Card chrome + KPI shells
                           │
                           ▼
                    Storybook + downstream surfaces (Dashboard, Builder)
```

* All primitives consume the same `ChartResult` contract. Any future surfaces must route through this orchestrator—no bespoke chart logic per screen.

#### Phase 3 done criteria

* Every Phase 2 golden `ChartResult` (time series, Live Flow composite, dwell null-bucket, retention heatmap, demographic splits, KPI tiles) plus the additional low coverage / empty / contract-violation fixtures render correctly in Storybook via the `charts:preview` command.
* Hover tooltips surface unit-formatted values, `rawCount`, and coverage indicators while preserving backend ordering; heatmaps disable zoom, other charts honour brush zoom.
* Axis manager enforces unit grouping, hides unused axes, caps at three Y-axes, and palette assignments remain stable when toggling visibility.
* Card chrome supports light/dark themes, tablet responsiveness, export/settings placeholders, and KPI tiles display delta arrows, coloured deltas, sparklines, and low-coverage messaging without layout jitter.
* Validation rejects malformed payloads (missing buckets, unsupported units, coverage outside 0–1, malformed heatmaps) and surfaces `ChartErrorState`; empty datasets render `ChartEmptyState` instead of silent blanks.
* Export stub posts `{ "spec": <ChartSpec>, "specHash": "<hash>" }` to `/api/analytics/export-placeholder` and is covered by unit tests alongside AxisManager and validation suites.
* Developer documentation and `handover/Phase2_Handover.md` explain fixture loading, Storybook workflows, lint/test commands, and manual injection of `ChartResult` JSON with no backend.
* Accessibility baseline (keyboard focus, ARIA labelling, contrast) validated across cards, legends, tooltips, and error/empty states.

#### What Phase 3 does **not** include

* No changes to existing Dashboard or Analytics pages yet.
* No builder UI, inspectors, or configuration surfaces.
* No presets.
* No preset catalogues or saved-view workflows.
* No dashboard grid or layout logic.
* No server-side pinning, persistence, or saved views.
* No BigQuery or backend query execution changes—Phase 3 is frontend engine only.
* No modifications to `ChartResult` schema, backend compiler logic, or canonical bucket calendar.
* No wholesale theming overhaul beyond using existing design tokens (add tokens only if gaps are documented).

#### Critical Notes for the Next Codex (Phase 3 Engineer)

* Do not compute analytics in the frontend—render only the values supplied by the backend `ChartResult`.
* Never infer or fabricate missing buckets; Phase 2 already guarantees canonical calendars and bucket ordering.
* Tooltips and legends must surface backend ordering, `rawCount`, `coverage`, and unit-formatted values without re-sorting.
* Low-coverage occupancy points must appear visually “low confidence” (badge/faded treatment) across all primitives.
* Null dwell buckets render as gaps—never interpolate, smooth, or backfill.
* Retention heatmaps must display the complete cohort × lag grid even when `rawCount = 0`; missing cells are bugs.
* Respect all metadata: coverage, rawCount, units, labels, and any series `meta` flags provided by the backend.
* Axis bindings live exclusively in the axis manager; primitives must not create ad-hoc axes or override scaling.
* Colours, axes, fonts, spacing should echo high-end references while strictly using existing design tokens unless a new token is documented.
* All chart logic must stay inside the shared engine—no screen-specific forks or duplicated chart code.
* Use Recharts as the rendering foundation; introducing alternative libraries is out of scope.
* Export interactions may only send backend-authored `ChartSpec` payloads and `specHash`—do not rewrite specs in the frontend.
* Every chart in the product will migrate onto this engine—optimise for configurability, testing, and reuse.

#### Phase 3 execution checklist

- [x] Scaffold `ChartRenderer` orchestrator with primitive registry and shared types.
- [x] Implement `AxisManager` and `SeriesPalette` enforcing unit rules, reserved colours, and ≤3 axes.
- [x] Build interaction hooks/UI (`useChartInteractions`, legends, toolbars) with low-confidence indicator behaviour.
- [x] Deliver card chrome + KPI primitives supporting light/dark themes, responsiveness, deltas, and sparklines.
- [x] Wire export stub + utility emitting `{ spec, specHash }` and add unit tests.
- [x] Create fixture loader utilities that pull golden examples from `shared/analytics/examples/`.
- [x] Author comprehensive Storybook stories covering all required scenarios (Live Flow, dwell nulls, low coverage, heatmaps, KPI, empty).
- [x] Update developer docs (plan + handover) with local commands, Storybook workflow, and spec injection guidance.
- [x] Validate accessibility, keyboard navigation, ARIA labels, and responsive breakpoints across cards and charts.

#### Phase 3 integration status (post-hardening)

* No production routes (`/dashboard`, `/analytics`, or legacy builder screens) import `ChartRenderer`, card chrome, or any new Phase 3 modules yet.
* Existing dashboard and analytics pages remain untouched; behaviour is identical to the pre-Phase 3 state.
* The only sanctioned entry point is Storybook via `npm --prefix frontend run charts:preview`, which consumes the golden Phase 2 fixtures through `loadChartFixture.ts`.
* The `ChartResult` schema and metadata contract (units, coverage, `rawCount`, labels, geometry) are now frozen for Phase 4. Any proposed changes must go through explicit change control.

### Phase 4 – Analytics Workspace & Presets

**What Phase 4 is**

Phase 4 delivers a **new analytics workspace shell** that is preset-first, opinionated, and entirely powered by the Phase 2 backend and Phase 3 chart engine. It introduces a rail + canvas + inspector layout where users launch curated presets, tweak them through guided controls, and view results rendered exclusively by the shared `ChartRenderer` inside the universal card chrome. The legacy JSON-tree builder is retired; all editing flows are declarative and UI-driven.

#### Phase 4 deliverables

**A. Analytics workspace shell**

* Route/layout: introduce `/analytics/v2` (behind a feature flag initially) with a persistent three-pane layout.
* Left rail: preset gallery with tabbed sections (`Trends`, `Demographics`, `Patterns`, `Retention`). Each preset tile shows name, description, and iconography.
* Main canvas: central card canvas hosting a single chart at a time using `ChartRenderer` + card chrome, accompanied by summary pills describing active site/time/split filters.
* Right inspector: guided configuration grouped into collapsible panels – “What data?” (site/camera scope), “What are we measuring?” (metric/preset), “How do we break it down?” (splits), “Who’s included?” (demographics), “How should it look?” (visual toggles).
* Responsive behaviour: layout must degrade gracefully to tablet (rail collapses to icon-only, inspector becomes drawer).

**B. Preset catalogue wiring**

* Source preset metadata from a structured catalogue (JSON/TS module) that provides: identifier, tab, title, description, icon, associated `ChartSpec` template ID, default filters/time range/granularity, and `ChartRenderer` expectations.
* Selecting a preset hydrates its `ChartSpec`, requests a `ChartResult` (initially via fixtures or mocked transport), and renders it in the main canvas card.
* Preset metadata must map 1:1 with backend-known `ChartSpec` identifiers so saved views/pins remain consistent across phases.

**C. Guided filters & time controls**

* Site/camera selectors: checkbox list with search/filter, writing into the active `ChartSpec` without exposing raw JSON.
* Time range presets: Today, Last 7 Days, Last 30 Days, Custom (calendar picker) with granularity auto-suggestions (5 min, 15 min, hour, day) based on preset capabilities.
* Split toggles: quick chips for sex, age, camera, event type, etc. Guard against unsupported splits per preset (disable with explanation).
* Metric-specific options (e.g., dwell mean vs. p90) are provided through radio buttons or segmented controls that update the spec template fields.

**D. Preset → spec → result pipeline**

* Document `PresetDefinition` → `ChartSpecTemplate` mapping, including how UI controls mutate template parameters (filters, date range, granularity, breakdowns).
* Enforce read-only handling of backend-authored fields (e.g., units, measure labels); the frontend may only alter filter/time/split parameters.
* Execution path: preset selection → apply UI deltas → send `ChartSpec` to analytics API (or fixture loader in early dev) → receive `ChartResult` → validate via Phase 3 contract → render with `ChartRenderer`.
* Provide a development harness to run presets against fixtures when backend connectivity is unavailable.

**E. Workspace empty/error/data states**

* Empty canvas when no preset is selected with onboarding guidance and quick-start buttons.
* Use Phase 3 `ChartErrorState` for contract violations and network failures; include retry instructions.
* “No data” state when backend returns zero coverage or empty buckets, surfacing reason (e.g., “No events for selected cameras between X and Y”).
* Preserve low-coverage styling inside the rendered charts to maintain trust signals.

**F. Commands & developer experience**

* Document local development commands: `npm --prefix frontend run dev` (workspace shell with feature flag), `npm --prefix frontend run charts:preview` (Storybook), backend fixture servers if needed.
* Provide instructions for toggling the `/analytics/v2` feature flag (environment variable or config file) and for swapping between fixture mode and live API calls.
* Include guidance for injecting arbitrary `ChartSpec`/`ChartResult` payloads into the workspace for debugging (leveraging the Phase 3 fixture utilities).

#### Phase 4 non-goals

* No modifications to existing dashboard routes or cards.
* No dashboard pinning, saved layout grid, or drag-and-drop management.
* No persistence of saved views beyond stubbed placeholders; full CRUD can be deferred to Phase 4.2/Phase 5.
* No new backend metrics or BigQuery queries beyond what Phase 2 already exposes (unless flagged as blockers).
* No builder-from-scratch JSON editing or legacy tree UI resurrection.
* No re-theming of global application chrome beyond workspace-specific layout.

#### Critical Notes for Phase 4 (Analytics Workspace Engineer)

* **Do not compute analytics in the frontend.** All values originate from backend-issued `ChartResult` payloads; UI controls may only request different specs.
* **Respect the canonical bucket timeline.** Never fabricate or interpolate buckets; rely on the Phase 2 calendar guarantees.
* **Use `ChartRenderer` exclusively.** Every chart within the workspace (including KPI tiles) must route through the shared engine and card chrome.
* **Surface backend metadata verbatim.** Units, coverage, `rawCount`, labels, and confidence flags must appear exactly as delivered; low coverage remains visually distinct.
* **Null dwell values remain gaps.** Do not smooth or fill nulls—render the absence per Phase 3 rules.
* **Retention heatmaps display full grids.** Never drop cells or remap axes; honour the backend ordering.
* **Guard against contract drift.** If validation fails, show the Phase 3 error card and log a change-control ticket rather than attempting to coerce data client-side.
* **Feature-flag integrations carefully.** Keep `/analytics/v2` hidden until QA complete; wiring must not regress legacy analytics routes during rollout.

#### Phase 4 execution checklist

- [ ] Scaffold `/analytics/v2` layout with rail, canvas, inspector, and feature flag.
- [ ] Implement preset catalogue module and connect it to rail UI.
- [ ] Hydrate initial preset into `ChartRenderer` using fixtures, then hook backend API.
- [ ] Build guided filter/time controls that mutate `ChartSpec` templates safely.
- [ ] Implement empty/no-data/error states across the workspace shell.
- [ ] Document developer commands, fixture usage, and feature-flag toggles.
- [ ] Validate responsive behaviour and accessibility across the new layout.

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
