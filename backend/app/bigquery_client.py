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

from typing import Optional
import logging
from google.oauth2 import service_account

try:  # pragma: no cover - informational logging only
    import db_dtypes  # type: ignore
    DB_DTYPES_VERSION = getattr(db_dtypes, "__version__", "unknown")
except Exception:  # pragma: no cover - defensive logging
    DB_DTYPES_VERSION = None


class BigQueryDataFrameError(RuntimeError):
    """Raised when a query job fails during DataFrame materialisation."""

    def __init__(self, message: str, job_id: Optional[str]) -> None:
        super().__init__(message)
        self.job_id = job_id


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
        self._bqstorage_client: Optional[object] = None
        self._bqstorage_unavailable = False

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

    def _get_bqstorage_client(self) -> Optional[object]:
        """Return a BigQuery Storage client if the dependency is available."""
        if self._bqstorage_unavailable:
            return None
        if self._bqstorage_client is None:
            try:
                from google.cloud import bigquery_storage

                self._bqstorage_client = bigquery_storage.BigQueryReadClient(
                    credentials=self._credentials
                )
                logger.info(
                    "Initialized BigQuery Storage client for high-throughput downloads"
                )
            except ImportError:
                logger.info(
                    "google-cloud-bigquery-storage not installed; using REST fallback"
                )
                self._bqstorage_unavailable = True
            except Exception:
                logger.exception(
                    "Failed to initialize BigQuery Storage client; falling back to REST"
                )
                self._bqstorage_unavailable = True
        return self._bqstorage_client if not self._bqstorage_unavailable else None

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

    def query_dataframe(
        self, sql: str, params: Dict[str, Any], *, job_context: Optional[str] = None
    ) -> pd.DataFrame:
        job = self.query(sql, params)
        try:
            result = job.result()
            storage_client = self._get_bqstorage_client()
            dataframe_kwargs: Dict[str, Any] = {}
            if storage_client is not None:
                dataframe_kwargs["bqstorage_client"] = storage_client
            else:
                dataframe_kwargs["create_bqstorage_client"] = False
            df = result.to_dataframe(**dataframe_kwargs)
            logger.debug(
                "BigQuery job %s materialised dataframe (%s rows) [%s]",
                job.job_id,
                len(df),
                job_context or "unlabeled",
            )
            return df
        except Exception as exc:
            logger.exception(
                "BigQuery job %s failed during to_dataframe [%s]: %s",
                getattr(job, "job_id", "unknown"),
                job_context or "unlabeled",
                exc,
            )
            raise BigQueryDataFrameError(str(exc), getattr(job, "job_id", None)) from exc

    def run_health_check(self) -> None:
        try:
            client = self._ensure_client()
            job = client.query("SELECT 1 AS ok", location=self.settings.location)
            result = job.result()
            storage_client = self._get_bqstorage_client()
            dataframe_kwargs: Dict[str, Any] = {}
            if storage_client is not None:
                dataframe_kwargs["bqstorage_client"] = storage_client
            else:
                dataframe_kwargs["create_bqstorage_client"] = False
            df = result.to_dataframe(**dataframe_kwargs)
            logger.info(
                "✅ BigQuery connectivity check succeeded (rows=%d, pandas=%s, db-dtypes=%s)",
                len(df),
                pd.__version__,
                DB_DTYPES_VERSION or "unavailable",
            )
        except Exception as exc:
            logger.exception("❌ BigQuery connectivity check failed: %s", exc)
            raise


bigquery_client = BigQueryClient()

__all__ = ["bigquery_client", "BigQueryClient", "BigQueryDataFrameError"]
