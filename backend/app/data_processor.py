"""
Intelligent Data Processor for camOS Analytics
Supports BigQuery data sources
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

import numpy as np
import pandas as pd
from fastapi import HTTPException

from .bigquery_client import bigquery_client
from .models import DataIntelligence

logger = logging.getLogger(__name__)

UTC = timezone.utc
DEFAULT_START = datetime(1970, 1, 1, tzinfo=UTC)
DEFAULT_END = datetime(2100, 1, 1, tzinfo=UTC)


def _parse_timestamp(value: Optional[str], *, is_end: bool = False) -> Optional[datetime]:
    """Parse ISO8601 or date-only strings into timezone-aware datetimes."""
    if not value:
        return None

    raw_value = value.strip()
    normalized = raw_value.replace("Z", "+00:00")

    dt: Optional[datetime] = None
    try:
        dt = datetime.fromisoformat(normalized)
    except ValueError:
        try:
            dt = datetime.strptime(raw_value, "%Y-%m-%d")
        except ValueError:
            logger.warning("Unable to parse timestamp value '%s'; ignoring filter", raw_value)
            return None

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)

    if is_end and len(raw_value) <= 10:
        dt = dt + timedelta(days=1) - timedelta(microseconds=1)

    return dt


def _resolve_time_bounds(filters: Dict[str, Optional[str]]) -> Dict[str, datetime]:
    start_ts = _parse_timestamp(filters.get("start_date")) or DEFAULT_START
    end_ts = _parse_timestamp(filters.get("end_date"), is_end=True) or DEFAULT_END

    if start_ts > end_ts:
        start_ts, end_ts = end_ts, start_ts

    return {"start_ts": start_ts, "end_ts": end_ts}


class DataProcessor:
    """Intelligent data processor that issues aggregation queries to BigQuery."""

    @staticmethod
    def get_aggregated_analytics(
        table_name: str, filters: Dict[str, Optional[str]] = None
    ) -> Dict[str, pd.DataFrame]:
        """Run the suite of BigQuery aggregation queries backing the analytics views."""
        try:
            filters = filters or {}
            params = _resolve_time_bounds(filters)

            table_identifier = f"`{table_name}`"

            base_conditions = ["timestamp BETWEEN @start_ts AND @end_ts"]
            dwell_conditions = ["timestamp BETWEEN @start_ts AND @end_ts"]
            entry_conditions = ["event = 1", "timestamp BETWEEN @start_ts AND @end_ts"]

            if filters.get("gender"):
                params["gender"] = filters["gender"]
                base_conditions.append("sex = @gender")
                dwell_conditions.append("sex = @gender")
                entry_conditions.append("sex = @gender")

            if filters.get("age_group"):
                params["age_group"] = filters["age_group"]
                base_conditions.append("age_bucket = @age_group")
                dwell_conditions.append("age_bucket = @age_group")
                entry_conditions.append("age_bucket = @age_group")

            if filters.get("event"):
                event_val = 1 if filters["event"] == "entry" else 0
                params["event"] = event_val
                base_conditions.append("event = @event")

            where_sql = "WHERE " + " AND ".join(base_conditions)
            dwell_where_sql = "WHERE " + " AND ".join(dwell_conditions)
            entry_where_sql = " AND ".join(entry_conditions)

            # Query 1: KPI totals and min/max timestamps
            stats_query = f"""
                SELECT
                    COUNT(*) AS total_records,
                    MIN(timestamp) AS min_timestamp,
                    MAX(timestamp) AS max_timestamp,
                    COUNTIF(event = 1) AS entries,
                    COUNTIF(event = 0) AS exits
                FROM {table_identifier}
                {where_sql}
            """
            stats_df = bigquery_client.query_dataframe(stats_query, params)

            # Query 2: Gender x age aggregation
            demo_query = f"""
                SELECT
                    sex,
                    age_bucket,
                    COUNT(*) AS count
                FROM {table_identifier}
                {where_sql}
                GROUP BY sex, age_bucket
            """
            demo_df = bigquery_client.query_dataframe(demo_query, params)

            # Query 3: Hourly distribution
            hourly_query = f"""
                SELECT
                    EXTRACT(HOUR FROM timestamp) AS hour,
                    COUNT(*) AS count
                FROM {table_identifier}
                {where_sql}
                GROUP BY hour
                ORDER BY hour
            """
            hourly_df = bigquery_client.query_dataframe(hourly_query, params)

            # Query 4: Raw event sample (10k rows max)
            records_query = f"""
                SELECT
                    track_id,
                    event,
                    timestamp,
                    sex,
                    age_bucket
                FROM {table_identifier}
                {where_sql}
                ORDER BY timestamp DESC
                LIMIT 10000
            """
            records_df = bigquery_client.query_dataframe(records_query, params)

            # Query 5: Dwell-time calculation using occupancy deltas
            dwell_query = f"""
                WITH ordered_events AS (
                    SELECT
                        timestamp,
                        IF(event = 1, 1, -1) AS occupancy_change
                    FROM {table_identifier}
                    {dwell_where_sql}
                    ORDER BY timestamp
                ),
                occupancy_periods AS (
                    SELECT
                        timestamp AS start_time,
                        LEAD(timestamp) OVER (ORDER BY timestamp) AS end_time,
                        SUM(occupancy_change) OVER (
                            ORDER BY timestamp
                            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                        ) AS occupancy
                    FROM ordered_events
                ),
                person_minutes AS (
                    SELECT
                        SUM(
                            IF(
                                end_time IS NOT NULL AND occupancy > 0,
                                occupancy * TIMESTAMP_DIFF(end_time, start_time, SECOND) / 60.0,
                                0
                            )
                        ) AS total_person_minutes
                    FROM occupancy_periods
                ),
                total_entries AS (
                    SELECT COUNT(*) AS entry_count
                    FROM {table_identifier}
                    WHERE {entry_where_sql}
                )
                SELECT
                    IF(entry_count > 0, total_person_minutes / entry_count, 0) AS avg_dwell_minutes
                FROM person_minutes, total_entries
            """
            dwell_params = dict(params)
            dwell_params.pop("event", None)
            dwell_df = bigquery_client.query_dataframe(dwell_query, dwell_params)

            logger.info("Loaded aggregated analytics for %s", table_name)

            return {
                "stats": stats_df,
                "demographics": demo_df,
                "hourly": hourly_df,
                "records": records_df,
                "dwell": dwell_df,
            }

        except HTTPException:
            raise
        except Exception as exc:
            logger.error("Failed to load aggregated analytics from %s: %s", table_name, exc)
            raise HTTPException(status_code=500, detail=f"BigQuery query failed: {exc}")

    @staticmethod
    def transform_bigquery_format(df: pd.DataFrame) -> pd.DataFrame:
        """Transform BigQuery event rows to the legacy analytics format."""
        df = df.copy()
        df["track_number"] = df["track_id"]
        df["event"] = df["event"].apply(lambda x: "entry" if x == 1 else "exit")
        df["age_estimate"] = df["age_bucket"]
        df["timestamp"] = pd.to_datetime(df["timestamp"])

        required_columns = ["index", "track_number", "event", "timestamp", "sex", "age_estimate"]
        if "index" not in df.columns:
            df["index"] = np.arange(len(df))

        df = df[required_columns]

        logger.info("Transformed %d records to analytics format", len(df))
        return df

    @staticmethod
    def process_timestamps(df: pd.DataFrame) -> pd.DataFrame:
        """Process timestamps - already in ISO format from BigQuery."""
        try:
            if "timestamp" in df.columns:
                df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")

            df["hour"] = df["timestamp"].dt.hour
            df["day_of_week"] = df["timestamp"].dt.day_name()
            df["date"] = df["timestamp"].dt.date

            df["hour"] = df["hour"].fillna(12)
            df["day_of_week"] = df["day_of_week"].fillna("Unknown")

            logger.info("Processed timestamps, %d valid timestamps", df["timestamp"].notna().sum())
            return df

        except Exception as exc:
            logger.error("Timestamp processing failed: %s", exc)
            raise HTTPException(status_code=400, detail=f"Timestamp processing failed: {exc}")

    @staticmethod
    def analyze_data_intelligence(df: pd.DataFrame) -> DataIntelligence:
        """Analyze data to provide intelligent insights."""
        valid_timestamps = df["timestamp"].dropna()
        latest_timestamp = valid_timestamps.max() if len(valid_timestamps) > 0 else None
        earliest_timestamp = valid_timestamps.min() if len(valid_timestamps) > 0 else None

        date_span_days = 0
        if latest_timestamp and earliest_timestamp:
            date_span_days = (latest_timestamp - earliest_timestamp).days

        optimal_granularity = "hourly"
        if date_span_days > 30:
            optimal_granularity = "weekly"
        elif date_span_days > 7:
            optimal_granularity = "daily"

        hourly_counts = df.groupby("hour").size()
        peak_hours = hourly_counts.nlargest(3).index.tolist()

        demographics_breakdown = {
            "gender": df["sex"].value_counts().to_dict(),
            "age_groups": df["age_estimate"].value_counts().to_dict(),
            "events": df["event"].value_counts().to_dict(),
        }

        temporal_patterns = {
            "hourly_distribution": df.groupby("hour").size().to_dict(),
            "daily_distribution": df.groupby("day_of_week").size().to_dict(),
            "peak_times": {
                "hour": int(hourly_counts.idxmax()) if len(hourly_counts) > 0 else 12,
                "count": int(hourly_counts.max()) if len(hourly_counts) > 0 else 0,
            },
        }

        return DataIntelligence(
            total_records=len(df),
            date_span_days=date_span_days,
            latest_timestamp=latest_timestamp,
            optimal_granularity=optimal_granularity,
            peak_hours=peak_hours,
            demographics_breakdown=demographics_breakdown,
            temporal_patterns=temporal_patterns,
        )

    @staticmethod
    def apply_filters(df: pd.DataFrame, filters: Dict[str, Optional[str]]) -> pd.DataFrame:
        """Apply intelligent filters to the data."""
        filtered_df = df.copy()

        if "start_date" in filters and filters["start_date"]:
            filtered_df = filtered_df[
                filtered_df["timestamp"] >= pd.to_datetime(filters["start_date"])
            ]

        if "end_date" in filters and filters["end_date"]:
            filtered_df = filtered_df[
                filtered_df["timestamp"] <= pd.to_datetime(filters["end_date"])
            ]

        if "gender" in filters and filters["gender"]:
            filtered_df = filtered_df[filtered_df["sex"] == filters["gender"]]

        if "age_group" in filters and filters["age_group"]:
            filtered_df = filtered_df[filtered_df["age_estimate"] == filters["age_group"]]

        if "event" in filters and filters["event"]:
            filtered_df = filtered_df[filtered_df["event"] == filters["event"]]

        logger.info("Applied filters, %d records remaining", len(filtered_df))
        return filtered_df
