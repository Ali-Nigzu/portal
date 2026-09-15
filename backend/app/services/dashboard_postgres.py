"""Lazy Cloud SQL IAM connections for the organisation dashboard only."""

from contextlib import contextmanager
from pathlib import Path
from threading import BoundedSemaphore, Lock

from google.oauth2 import service_account
from google.cloud.sql.connector import Connector

APPLICATION_ROOT = Path(__file__).resolve().parents[3]
INSTANCE = "camosbase:europe-west2:camos-prod-postgres"
DATABASE = "camos_prod"


class DashboardStorageUnavailable(RuntimeError):
    pass


class DashboardPostgres:
    """Share connector certificate/token lifecycle, bound concurrent SQL reads.

    pg8000 connections are request-owned and always closed. No network or key
    access at construction/startup: an outage must not affect email or signup.
    Routes using this synchronous driver run in FastAPI's worker thread pool.
    """

    def __init__(self):
        self._connector = None
        self._username = None
        self._lock = Lock()
        self._slots = BoundedSemaphore(4)

    def _get_connector(self):
        with self._lock:
            if self._connector is None:
                credentials = service_account.Credentials.from_service_account_file(
                    str(APPLICATION_ROOT / "sa.json")
                )
                self._username = credentials.service_account_email.removesuffix(
                    ".gserviceaccount.com"
                )
                self._connector = Connector(
                    credentials=credentials, refresh_strategy="LAZY", timeout=10
                )
            return self._connector

    @contextmanager
    def connection(self):
        if not self._slots.acquire(timeout=10):
            raise DashboardStorageUnavailable("Dashboard storage is busy")
        connection = None
        try:
            connector = self._get_connector()
            connection = connector.connect(
                INSTANCE, "pg8000", user=self._username, db=DATABASE,
                enable_iam_auth=True, timeout=10,
            )
            # Avoid implicit BEGIN/COMMIT; the application's SQL is SELECT only.
            connection.autocommit = True
            yield connection
        finally:
            try:
                if connection is not None:
                    connection.close()
            finally:
                self._slots.release()

    def close(self):
        with self._lock:
            if self._connector is not None:
                self._connector.close()
                self._connector = None

