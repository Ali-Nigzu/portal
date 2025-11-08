"""BigQuery client utilities for analytics queries."""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

import pandas as pd
from google.cloud import bigquery
from google.oauth2 import service_account

logger = logging.getLogger(__name__)


def _load_credentials() -> Optional[service_account.Credentials]:
    """Load service account credentials from environment configuration."""
    credentials_json = os.getenv("BQ_SERVICE_ACCOUNT_JSON")
    credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")

    try:
        if credentials_json:
            info = json.loads(credentials_json)
            return service_account.Credentials.from_service_account_info(info)
        if credentials_path and os.path.exists(credentials_path):
            return service_account.Credentials.from_service_account_file(credentials_path)
    except Exception:
        logger.exception("Failed to load BigQuery service account credentials")
        raise

    # Fall back to Application Default Credentials (ADC)
    return None


def _normalize_project(project: Optional[str]) -> Optional[str]:
    if project:
        return project
    return os.getenv("BQ_PROJECT") or os.getenv("GOOGLE_CLOUD_PROJECT")


@dataclass
class BigQuerySettings:
    project: Optional[str]
    dataset: Optional[str]
    location: Optional[str]


class BigQueryClient:
    """Wrapper around the google-cloud-bigquery client with convenience helpers."""

    def __init__(self) -> None:
        self.settings = BigQuerySettings(
            project=_normalize_project(os.getenv("BQ_PROJECT")),
            dataset=os.getenv("BQ_DATASET"),
            location=os.getenv("BQ_LOCATION") or os.getenv("GOOGLE_CLOUD_LOCATION"),
        )
        self._credentials = _load_credentials()
        self._client: Optional[bigquery.Client] = None

    def _ensure_client(self) -> bigquery.Client:
        if self._client is None:
            self._client = bigquery.Client(
                project=self.settings.project,
                credentials=self._credentials,
                location=self.settings.location,
            )
            logger.info(
                "Initialized BigQuery client (project=%s, dataset=%s, location=%s)",
                self.settings.project,
                self.settings.dataset,
                self.settings.location,
            )
        return self._client

    def _build_query_parameters(self, params: Dict[str, Any]) -> List[bigquery.ScalarQueryParameter]:
        query_parameters: List[bigquery.ScalarQueryParameter] = []
        for name, value in params.items():
            if isinstance(value, datetime):
                query_parameters.append(bigquery.ScalarQueryParameter(name, "TIMESTAMP", value))
            elif isinstance(value, bool):
                query_parameters.append(bigquery.ScalarQueryParameter(name, "BOOL", value))
            elif isinstance(value, int):
                query_parameters.append(bigquery.ScalarQueryParameter(name, "INT64", value))
            elif isinstance(value, float):
                query_parameters.append(bigquery.ScalarQueryParameter(name, "FLOAT64", value))
            elif value is None:
                # Skip None-valued params—they should not be referenced in the SQL
                continue
            else:
                query_parameters.append(bigquery.ScalarQueryParameter(name, "STRING", value))
        return query_parameters

    def query(self, sql: str, params: Dict[str, Any]) -> bigquery.job.QueryJob:
        job_config = bigquery.QueryJobConfig(
            query_parameters=self._build_query_parameters(params),
            use_query_cache=True,
        )
        logger.debug("Executing BigQuery SQL: %s | params=%s", sql, params)
        client = self._ensure_client()
        job = client.query(sql, job_config=job_config, location=self.settings.location)
        return job

    def query_dataframe(self, sql: str, params: Dict[str, Any]) -> pd.DataFrame:
        job = self.query(sql, params)
        return job.result().to_dataframe(create_bqstorage_client=False)

    def run_health_check(self) -> None:
        try:
            client = self._ensure_client()
            job = client.query("SELECT 1", location=self.settings.location)
            job.result()
            logger.info("✅ BigQuery connectivity check succeeded")
        except Exception as exc:
            logger.exception("❌ BigQuery connectivity check failed: %s", exc)
            raise


bigquery_client = BigQueryClient()

__all__ = ["bigquery_client", "BigQueryClient"]
