"""
Cloud SQL Connection Module for Nigzsu Analytics
Handles direct PostgreSQL TCP connections (no Cloud SQL Connector)
"""

import os
import logging
import psycopg2
from contextlib import contextmanager
from sqlalchemy import create_engine, text

logger = logging.getLogger(__name__)

DB_HOST = os.getenv("DB_HOST", "34.105.230.76")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASS = os.getenv("DB_PASS", "")
DB_NAME = os.getenv("DB_NAME", "postgres")

logger.info(
    f"Initializing direct PostgreSQL connection: HOST={DB_HOST}, USER={DB_USER}, DB={DB_NAME}"
)

class CloudSQLConnection:
    """Direct PostgreSQL connection manager (for use outside GCP)"""

    def __init__(self):
        self._engine = None
        self._connect()

    def _connect(self):
        """Initialize SQLAlchemy engine for direct TCP connection"""
        try:
            conn_str = f"postgresql+psycopg2://{DB_USER}:{DB_PASS}@{DB_HOST}:5432/{DB_NAME}"
            self._engine = create_engine(
                conn_str,
                pool_pre_ping=True,
                pool_size=5,
                max_overflow=2,
            )
            logger.info(f"✅ Connected directly to PostgreSQL at {DB_HOST}")
        except Exception as e:
            logger.error(f"❌ Database connection failed: {e}")
            raise

    @contextmanager
    def get_connection_context(self):
        """Provide a connection context"""
        conn = self._engine.connect()
        try:
            yield conn
        finally:
            conn.close()

    def execute_query(self, query: str, params: dict = None):
        """Execute a SQL query and return results"""
        try:
            with self.get_connection_context() as conn:
                result = conn.execute(text(query), params or {})
                return result.fetchall()
        except Exception as e:
            logger.error(f"Query execution failed: {e}")
            raise

    def close(self):
        """Dispose the SQLAlchemy engine"""
        if self._engine:
            self._engine.dispose()
            logger.info("Closed PostgreSQL engine")


cloudsql_connection = CloudSQLConnection()

# Startup test
try:
    with cloudsql_connection.get_connection_context() as conn:
        conn.execute(text("SELECT 1"))
        logger.info("✅ PostgreSQL connection test succeeded.")
except Exception as e:
    logger.error(f"❌ PostgreSQL connection test failed: {e}")