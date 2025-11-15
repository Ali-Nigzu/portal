# Data Contract – BigQuery Event Metrics

## 1. Overview

This contract defines the canonical mapping between the BigQuery event tables and every
analytics metric produced by camOS. It establishes the only accepted column semantics,
metric formulas, allowed dimensions, and time range rules so that backend services and
frontend surfaces all consume a single source of truth.

## 2. Core BigQuery Tables

| Context | Table Pattern | Purpose |
| --- | --- | --- |
| `client0` (default org) | `nigzsu.demodata.client0` | Primary production events table with one row per camera event. |
| `client1` (alt org) | `nigzsu.demodata.client1` | Secondary client feed with identical schema and semantics. |
| Fixture mode | `<fixture_project>.<fixture_dataset>.<fixture_table>` | Demo dataset used for fixtures; schema and column meanings must match production. |

Every table listed above contains only the columns in the next section. No other
BigQuery fields are referenced by analytics code.

## 3. Column Reference Table

| Column | Type | Meaning | Metrics |
| --- | --- | --- | --- |
| `timestamp` | `TIMESTAMP` (UTC) | Event occurrence time. Drives window filters and bucket alignment. | All metrics. |
| `event` | `INT64` (`1` = entrance, `0` = exit only) | Encodes ingress/egress activity. | Entrances, exits, occupancy, dwell, retention, coverage. |
| `index` | `INT64` | Monotonically increasing counter per camera used for deterministic ordering when timestamps tie. | Occupancy, dwell, retention. |
| `site_id` | `STRING` | Client site identifier. | Site-level splits and filters. |
| `cam_id` | `STRING` | Camera or zone identifier within a site. | Camera-level splits, dwell pairing. |
| `track_id` | `STRING` | Visitor/session identifier used to pair entrances with exits and detect revisits. | Dwell, retention, raw event views. |
| `sex` | `STRING` (`'M'`, `'F'`, or `NULL → 'Unknown'`) | Visitor gender classification, normalised to `'Unknown'` when null. | Demographic filters/splits, raw events. |
| `age_bucket` | `STRING` (`0-4`, `5-13`, `14-25`, `26-45`, `46-65`, `66+`, `NULL → 'Unknown'`) | Visitor age band, normalised to `'Unknown'` when null. | Demographic filters/splits, raw events. |

## 4. Canonical Metric Definitions

### Entrances
- **Inputs:** `event`, `timestamp`, optional site/camera/demographic filters.
- **Definition:** Count of events where `event = 1` inside the requested time window.
- **Pseudo-SQL:**
  ```sql
  SELECT bucket_start,
         COUNTIF(event = 1) AS value
  FROM scoped_events
  GROUP BY bucket_start
  ```
- **Allowed Dimensions:** `time` (required), `site`, `camera`, `sex`, `age_bucket`.
- **Time Bucketing:** `HOUR` for 24-hour ranges, `DAY` for ≥7-day ranges, configurable `5_MIN` for live flow.

### Exits
- **Inputs:** `event`, `timestamp`.
- **Definition:** Count of events where `event = 0` inside the requested time window.
- **Pseudo-SQL:** identical to entrances with `COUNTIF(event = 0)`.
- **Allowed Dimensions:** `time`, `site`, `camera`, `sex`, `age_bucket`.
- **Time Bucketing:** Mirrors entrances.

### Occupancy
- **Inputs:** `event`, `timestamp`, `index`, optional `site_id`/`cam_id` filters.
- **Definition:** Net occupants derived from cumulative entrances minus exits, ordered by (`timestamp`, `index`) and clamped at zero when seeded by an exit.
- **Pseudo-SQL:**
  ```sql
  WITH ordered AS (
    SELECT site_id,
           cam_id,
           timestamp,
           IF(event = 1, 1, -1) AS delta,
           SUM(IF(event = 1, 1, -1)) OVER (
             PARTITION BY site_id, cam_id
             ORDER BY timestamp, index
           ) AS running_total
    FROM scoped_events
  )
  SELECT bucket_start,
         ANY_VALUE(running_total ORDER BY timestamp DESC, index DESC) AS value
  FROM ordered
  JOIN bucket_calendar USING (site_id, cam_id)
  ```
- **Allowed Dimensions:** `time` (required), `site`, `camera`.
- **Time Bucketing:** `5_MIN`, `HOUR`, or `DAY` depending on the dashboard surface.

### Average Dwell Time
- **Inputs:** `track_id`, `event`, `timestamp`, `index`, optional `cam_id` filter.
- **Definition:** Average minutes between paired entrance (`event = 1`) and exit (`event = 0`) events for the same `track_id`, paired by row number per (`site_id`, `cam_id`, `track_id`) and constrained to sessions ≤ 6 hours.
- **Pseudo-SQL:**
  ```sql
  WITH entrances AS (
    SELECT site_id, cam_id, track_id, timestamp, ROW_NUMBER() OVER (
             PARTITION BY site_id, cam_id, track_id
             ORDER BY timestamp, index
         ) AS rn
    FROM scoped_events
    WHERE event = 1
  ),
  exits AS (
    SELECT site_id, cam_id, track_id, timestamp, ROW_NUMBER() OVER (
             PARTITION BY site_id, cam_id, track_id
             ORDER BY timestamp, index
         ) AS rn
    FROM scoped_events
    WHERE event = 0
  ),
  sessions AS (
    SELECT TIMESTAMP_DIFF(x.timestamp, e.timestamp, MINUTE) AS dwell_minutes
    FROM entrances e
    JOIN exits x USING (site_id, cam_id, track_id, rn)
    WHERE TIMESTAMP_DIFF(x.timestamp, e.timestamp, MINUTE) BETWEEN 0 AND 360
  )
  SELECT bucket_start,
         AVG(dwell_minutes) AS value,
         COUNT(*) AS raw_count
  FROM sessions JOIN bucket_calendar
  ```
- **Allowed Dimensions:** `time` (required), `camera`.
- **Time Bucketing:** `HOUR` default, `DAY` optional for longer windows.

### Retention / Return Rate
- **Inputs:** `track_id`, `timestamp`, `index`, `event`.
- **Definition:** Weekly (or monthly) cohort matrix showing the fraction of visitors that return after `lag` periods. Entrances are deduplicated so that sequential events from the same `track_id` count as one visit when separated by <30 minutes.
- **Pseudo-SQL:**
  ```sql
  WITH visits AS (
    SELECT site_id,
           track_id,
           TIMESTAMP_TRUNC(timestamp, WEEK(MONDAY)) AS cohort_week,
           timestamp AS visit_ts,
           LAG(timestamp) OVER (
             PARTITION BY site_id, track_id
             ORDER BY timestamp, index
           ) AS prev_ts
    FROM scoped_events
    WHERE event = 1
  ),
  deduped AS (
    SELECT * FROM visits
    WHERE prev_ts IS NULL OR TIMESTAMP_DIFF(timestamp, prev_ts, MINUTE) >= 30
  ),
  returns AS (
    SELECT first.cohort_week,
           CAST(FLOOR(TIMESTAMP_DIFF(later.visit_ts, first.visit_ts, DAY) / 7) AS INT64) AS lag_weeks,
           later.track_id
    FROM deduped first
    JOIN deduped later
      ON first.site_id = later.site_id
     AND first.track_id = later.track_id
     AND later.visit_ts >= first.visit_ts
  )
  SELECT cohort_week AS bucket_start,
         lag_weeks,
         SAFE_DIVIDE(COUNT(DISTINCT track_id), cohort_size) AS value
  FROM returns
  JOIN cohort_sizes USING (cohort_week)
  ```
- **Allowed Dimensions:** `time` (cohort start) and `retention_lag` (weeks or months).
- **Time Bucketing:** Cohorts align to `WEEK(MONDAY)` by default; `MONTH` supported for monthly retention.

### Coverage / Freshness
- **Inputs:** `timestamp` relative to requested window bounds.
- **Definition:** Fraction of the bucket that contains any events (`window_seconds / bucket_seconds`) and minutes since the last event for freshness KPIs. Derived from the generated calendar using the same event table; no extra columns are consulted.
- **Allowed Dimensions:** `time` only.
- **Time Bucketing:** Matches the parent metric (`5_MIN`, `HOUR`, or `DAY`).

## 5. Canonical Dimensions

| Dimension | Expression | Notes |
| --- | --- | --- |
| `time` | `TIMESTAMP_TRUNC(timestamp, <bucket>)` | Primary x-axis; bucket chosen from time range defaults. |
| `site` | `site_id` | Filters or splits events per site. |
| `camera` | `cam_id` | Filters or splits events per camera. |
| `sex` | `COALESCE(sex, 'Unknown')` | Null genders surface as `'Unknown'` in both filters and results. |
| `age_bucket` | `COALESCE(age_bucket, 'Unknown')` | Null ages surface as `'Unknown'`. |
| `retention_lag` | `lag_weeks` / `lag_months` | Derived dimension for retention matrices. |

## 6. Time Ranges

| Key | Start | End | Default Bucket | Pseudo Filter |
| --- | --- | --- | --- | --- |
| `last_24_hours` | `NOW() - INTERVAL 24 HOUR` | `NOW()` | `HOUR` | `timestamp BETWEEN @start_ts AND @end_ts` |
| `last_7_days` | `NOW() - INTERVAL 7 DAY` | `NOW()` | `DAY` | `timestamp BETWEEN @start_ts AND @end_ts` |
| `last_30_days` | `NOW() - INTERVAL 30 DAY` | `NOW()` | `DAY` | `timestamp BETWEEN @start_ts AND @end_ts` |
| `custom` | Provided `@start_ts` | Provided `@end_ts` | Caller supplied via `bucket` | `timestamp BETWEEN @start_ts AND @end_ts` |

All time bounds are normalised to UTC and validated so `start_ts ≤ end_ts`.

## 7. Contract Rules

1. All analytics SQL must be generated through `backend/app/analytics/data_contract.py` using the enumerated metrics, dimensions, and time ranges.
2. No backend or frontend component may reference a column outside `{site_id, cam_id, index, track_id, event, timestamp, sex, age_bucket}`.
3. The values `'Unknown'` for `sex` and `age_bucket` are produced via `COALESCE` during query construction and must be used for filtering and display instead of nulls.
4. UI elements must never surface fake camera or site identifiers in live mode. Fixture mode may use explicit `fixture_*` labels but must still rely on the same contract.
5. Fixture/demonstration datasets must honour the exact schema and semantics outlined above; only table names differ.
6. Any unsupported metric/dimension combination must raise `UnsupportedMetricDimensionCombination` so downstream callers cannot invent new aggregations.
7. Time filters are always expressed as `timestamp BETWEEN @start_ts AND @end_ts` with inclusive lower bounds and exclusive upper bounds enforced by calendar generation.
