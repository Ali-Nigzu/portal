"""Shared lazy ADC-backed Cloud SQL IAM connection pool for Portal readers."""

from contextlib import contextmanager
import os
from threading import Lock

from google.cloud.sql.connector import Connector
from sqlalchemy.pool import QueuePool

INSTANCE = "camosbase:europe-west2:camos-prod-postgres"
DATABASE = "camos_prod"


class DashboardStorageUnavailable(RuntimeError):
    pass


class DashboardPostgres:
    """Share connector certificate/token lifecycle, bound concurrent SQL reads.

    pg8000 connections are checked out per operation and returned to the pool.
    No network access at construction: an outage must not affect email or signup.
    Routes using this synchronous driver run in FastAPI's worker thread pool.
    """

    def __init__(self):
        self._connector = None
        self._lock = Lock()
        self._pool = QueuePool(
            self._connect,
            pool_size=4,
            max_overflow=0,
            timeout=10,
            recycle=1800,
            pre_ping=False,
        )

    def _get_connector(self):
        with self._lock:
            if self._connector is None:
                self._connector = Connector(refresh_strategy="LAZY", timeout=10)
            return self._connector

    def _connect(self):
        connection = self._get_connector().connect(
            os.getenv("CLOUD_SQL_INSTANCE", INSTANCE),
            "pg8000",
            user=os.getenv("PORTAL_DB_USER", "portal-reader@camosbase.iam"),
            db=os.getenv("PORTAL_DB_NAME", DATABASE),
            enable_iam_auth=True,
            timeout=10,
        )
        connection.autocommit = True
        return connection

    @contextmanager
    def connection(self):
        connection = None
        try:
            connection = self._pool.connect()
            yield connection
        except Exception:
            if connection is not None:
                connection.invalidate()
            raise
        finally:
            if connection is not None:
                connection.close()

    def close(self):
        self._pool.dispose()
        with self._lock:
            if self._connector is not None:
                self._connector.close()
                self._connector = None
