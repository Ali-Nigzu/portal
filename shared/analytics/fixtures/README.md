# Golden Event Fixtures

Phase 1 requires canonical fixture datasets that exercise the CCTV event
schema without depending on the production tables. The CSV files in this
folder are intended to be loaded into temporary BigQuery tables
(e.g. `nigzsu.analytics_fixtures.client0_events`) and mirrored in unit tests.

## Dataset summary

- **`events_golden_client0.csv`** – minimal yet expressive set of entrance and
  exit events for `SITE_01` covering:
  - Multiple cameras (`CAM_A`, `CAM_B`).
  - Entrance/exit pairing for dwell metrics.
  - Repeated visitor (`track_id = T1`) returning later the same day.
  - Weekly repeat visitor (`track_id = T4`) to support retention curves.
  - Demographic variety across `sex` and `age_bucket` values.

## Loading into BigQuery

```bash
bq load \
  --source_format=CSV \
  --autodetect \
  nigzsu:analytics_fixtures.client0_events \
  shared/analytics/fixtures/events_golden_client0.csv
```

The target table should be partitioned by `DATE(timestamp)` and clustered by
`(site_id, cam_id)` to match production expectations.

## Expected outputs

Deterministic ChartResult payloads derived from this fixture live in
`shared/analytics/examples`. The backend tests recalculate the metrics using
pandas to guarantee the JSON stays in sync with the fixture.
