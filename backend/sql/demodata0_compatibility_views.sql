-- Compatibility views adapting demodata0 tables to the legacy canonical schema.
-- These views enforce timestamp filtering, demographic mapping, and synthetic index reconstruction.

CREATE OR REPLACE VIEW `nigzsu.demodata0.client0_compat` AS
SELECT
  site_id,
  cam_id,
  track_id,
  event,
  timestamp,
  ROW_NUMBER() OVER (
    PARTITION BY site_id, cam_id, track_id
    ORDER BY timestamp, event DESC, track_id
  ) AS index,
  CASE sex
    WHEN 0 THEN 'M'
    WHEN 1 THEN 'F'
  END AS sex,
  CASE age_bucket
    WHEN 0 THEN '0-4'
    WHEN 1 THEN '5-13'
    WHEN 2 THEN '14-25'
    WHEN 3 THEN '26-45'
    WHEN 4 THEN '46-65'
    WHEN 5 THEN '66+'
  END AS age_bucket
FROM `nigzsu.demodata0.client0`
WHERE timestamp < TIMESTAMP(@now);

CREATE OR REPLACE VIEW `nigzsu.demodata0.client1_compat` AS
SELECT
  site_id,
  cam_id,
  track_id,
  event,
  timestamp,
  ROW_NUMBER() OVER (
    PARTITION BY site_id, cam_id, track_id
    ORDER BY timestamp, event DESC, track_id
  ) AS index,
  CASE sex
    WHEN 0 THEN 'M'
    WHEN 1 THEN 'F'
  END AS sex,
  CASE age_bucket
    WHEN 0 THEN '0-4'
    WHEN 1 THEN '5-13'
    WHEN 2 THEN '14-25'
    WHEN 3 THEN '26-45'
    WHEN 4 THEN '46-65'
    WHEN 5 THEN '66+'
  END AS age_bucket
FROM `nigzsu.demodata0.client1`
WHERE timestamp < TIMESTAMP(@now);
