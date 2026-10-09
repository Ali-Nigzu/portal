"""BigQuery client utilities for analytics queries."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional
from threading import Lock

from google.cloud import bigquery

logger = logging.getLogger(__name__)


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
        # ADC resolves the attached runtime identity; never load a bundled key.
        self._credentials = None
        self._client: Optional[bigquery.Client] = None
        self._lock = Lock()

    def _ensure_client(self) -> bigquery.Client:
        with self._lock:
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
            elif isinstance(value, (list, tuple)):
                sequence = [item for item in value if item is not None]
                if not sequence:
                    continue
                if all(isinstance(item, bool) for item in sequence):
                    array_type = "BOOL"
                elif all(isinstance(item, int) for item in sequence):
                    array_type = "INT64"
                elif all(isinstance(item, float) for item in sequence):
                    array_type = "FLOAT64"
                else:
                    array_type = "STRING"
                    sequence = [str(item) for item in sequence]
                query_parameters.append(bigquery.ArrayQueryParameter(name, array_type, sequence))
            elif value is None:
                # Skip None-valued params—they should not be referenced in the SQL
                continue
            else:
                query_parameters.append(bigquery.ScalarQueryParameter(name, "STRING", value))
        return query_parameters


    def portal_rows(self, sql, params, *, limit):
        """Bounded REST rows, not DataFrames or the Storage API."""
        config = bigquery.QueryJobConfig(
            query_parameters=self._build_query_parameters(params),
            maximum_bytes_billed=int(os.getenv("PORTAL_BQ_MAX_BYTES", "1000000000")),
            use_query_cache=True,
        )
        job = self._ensure_client().query(sql, job_config=config, location=self.settings.location,
                                          timeout=10)
        try:
            return list(job.result(timeout=30, page_size=min(limit, 1000), max_results=limit))
        except Exception:
            try:
                job.cancel()
            except Exception:
                pass
            raise

    def close(self):
        for client in (self._client,):
            if client is not None:
                client.close()


    def run_health_check(self) -> None:
        job = None
        try:
            client = self._ensure_client()
            job = client.query("SELECT 1 AS ok", location=self.settings.location, timeout=10)
            rows = list(job.result(timeout=30, page_size=1, max_results=1))
            logger.info("BigQuery connectivity check succeeded (rows=%d)", len(rows))
        except Exception:
            if job is not None:
                try:
                    job.cancel()
                except Exception:
                    pass
            raise


bigquery_client = BigQueryClient()

__all__ = ["bigquery_client", "BigQueryClient"]
