"""
Intelligent Data Processor for camOS Analytics
Supports BigQuery data sources
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

import pandas as pd
from fastapi import HTTPException

from .analytics.data_contract import (
    Dimension,
    Metric,
    QueryContext,
    TimeRangeKey,
    compile_contract_query,
)
from .bigquery_client import BigQueryDataFrameError, bigquery_client
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
    def _build_context(
        *,
        table_name: str,
        org_id: str,
        filters: Dict[str, Optional[str]],
    ) -> QueryContext:
        bounds = _resolve_time_bounds(filters)
        sexes = [filters["gender"]] if filters.get("gender") else None
        age_buckets = [filters["age_group"]] if filters.get("age_group") else None
        event_filter = filters.get("event")
        if event_filter:
            event_types = [1 if event_filter == "entry" else 0]
        else:
            event_types = None
        return QueryContext(
            org_id=org_id,
            table_name=table_name,
            start=bounds["start_ts"],
            end=bounds["end_ts"],
            time_range=TimeRangeKey.CUSTOM,
            site_ids=[filters["site_id"]] if filters.get("site_id") else None,
            camera_ids=[filters["camera_id"]] if filters.get("camera_id") else None,
            sexes=sexes,
            age_buckets=age_buckets,
            event_types=event_types,
        )

    @staticmethod
    def _execute(plan, *, table_name: str, job: str) -> pd.DataFrame:
        return bigquery_client.query_dataframe(plan.sql, plan.params, job_context=f"{table_name}::{job}")

    @classmethod
    def get_aggregated_analytics(
        cls, table_name: str, filters: Dict[str, Optional[str]] = None, *, org_id: str
    ) -> Dict[str, pd.DataFrame]:
        """Run the suite of BigQuery aggregation queries backing the analytics views."""
        try:
            filters = filters or {}
            context = cls._build_context(table_name=table_name, org_id=org_id, filters=filters)

            summary_plan = compile_contract_query(Metric.EVENT_SUMMARY, [], context)
            stats_df = cls._execute(summary_plan, table_name=table_name, job="stats")
            if not stats_df.empty and "entrances" in stats_df.columns:
                stats_df = stats_df.rename(columns={"entrances": "entries"})

            demographics_plan = compile_contract_query(Metric.DEMOGRAPHICS, [], context)
            demo_df = cls._execute(demographics_plan, table_name=table_name, job="demographics")

            hourly_ctx = context.model_copy(update={"bucket": "HOUR"})
            hourly_plan = compile_contract_query(Metric.ACTIVITY, [Dimension.TIME], hourly_ctx)
            hourly_df = cls._execute(hourly_plan, table_name=table_name, job="hourly")
            if not hourly_df.empty:
                hourly_df = hourly_df[hourly_df["measure_id"] == hourly_plan.measure_id].copy()
                hourly_df["hour"] = hourly_df["bucket_start"].dt.tz_convert("UTC").dt.hour
                hourly_df.rename(columns={"value": "count"}, inplace=True)

            records_plan = compile_contract_query(Metric.RAW_EVENTS, [], context)
            records_df = cls._execute(records_plan, table_name=table_name, job="records")
            if not records_df.empty:
                records_df["event"] = records_df["event_type"].apply(lambda v: "entry" if int(v) == 1 else "exit")
                records_df.drop(columns=["event_type"], inplace=True, errors="ignore")

            dwell_ctx = context.model_copy(update={"bucket": "HOUR"})
            dwell_plan = compile_contract_query(Metric.AVG_DWELL, [Dimension.TIME], dwell_ctx)
            dwell_frame = cls._execute(dwell_plan, table_name=table_name, job="dwell")
            if not dwell_frame.empty:
                dwell_subset = dwell_frame[dwell_frame["measure_id"] == dwell_plan.measure_id].copy()
                dwell_subset["raw_count"] = dwell_subset["raw_count"].fillna(0)
                numerator = (dwell_subset["value"].fillna(0.0) * dwell_subset["raw_count"]).sum()
                denominator = dwell_subset["raw_count"].sum()
                avg_dwell = float(numerator / denominator) if denominator else 0.0
            else:
                avg_dwell = 0.0
            dwell_df = pd.DataFrame([{"avg_dwell_minutes": avg_dwell}])

            logger.info("Loaded aggregated analytics for %s", table_name)

            return {
                "stats": stats_df,
                "demographics": demo_df,
                "hourly": hourly_df[["hour", "count"]] if not hourly_df.empty else hourly_df,
                "records": records_df,
                "dwell": dwell_df,
            }

        except BigQueryDataFrameError as exc:
            logger.error(
                "Failed to load aggregated analytics from %s (job_id=%s): %s",
                table_name,
                exc.job_id,
                exc,
            )
            raise HTTPException(
                status_code=502,
                detail={
                    "message": "BigQuery dataframe conversion failed",
                    "job_id": exc.job_id,
                },
            ) from exc
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
            df["index"] = range(len(df))

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
