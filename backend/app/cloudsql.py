"""
Cloud SQL Connection Module for camOS Analytics
Handles secure connections to Google Cloud SQL PostgreSQL instances
"""

import os
import json
import logging
from typing import Optional
from contextlib import contextmanager
from google.cloud.sql.connector import Connector
import sqlalchemy
from sqlalchemy import text

logger = logging.getLogger(__name__)

INSTANCE_CONNECTION_NAME = os.environ.get("INSTANCE_CONNECTION_NAME", "camOS:europe-west2:camOStestdb")
DB_USER = os.environ.get("DB_USER", "postgres")
DB_PASS = os.environ.get("DB_PASS", "")
DB_NAME = os.environ.get("DB_NAME", "postgres")

logger.info(
    f"Initializing Cloud SQL with INSTANCE={INSTANCE_CONNECTION_NAME}, "
    f"USER={DB_USER}, DB={DB_NAME}"
)

class CloudSQLConnection:
    """Manages Cloud SQL connections using service account authentication"""
    
    def __init__(self):
        self.connector = None
        self._engine = None
        self.credentials_path = None
        self._initialize_connector()
    
    #def _initialize_connector(self):
    #    """Initialize the Cloud SQL connector with service account credentials"""
    #    try:
    #        credentials_json = os.environ.get('GOOGLE_CLOUD_KEY')
    #        if not credentials_json:
    #            raise ValueError("GOOGLE_CLOUD_KEY environment variable not set")
    #        
    #        #credentials_dict = json.loads(credentials_json)


    #        import base64

    #        key_b64 = os.environ.get('GOOGLE_CLOUD_KEY')
    #        if not key_b64:
    #            raise ValueError("GOOGLE_CLOUD_KEY environment variable not set")

    #        credentials_json = base64.b64decode(key_b64).decode("utf-8")
    #        credentials_dict = json.loads(credentials_json)


            
            #import tempfile
            #with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            #    f.write(credentials_json)
            #    self.credentials_path = f.name
            
            #os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = self.credentials_path
            
    #        from google.oauth2 import service_account
    #        credentials = service_account.Credentials.from_service_account_info(credentials_dict)
            
    #        self.connector = Connector(credentials=credentials)
    #        logger.info("Cloud SQL Connector initialized successfully")
            
    #    except Exception as e:
    #        logger.error(f"Failed to initialize Cloud SQL connector: {e}")
    #        raise

    def _initialize_connector(self):
        """Initialize the Cloud SQL connector using default credentials"""
        try:
            from google.cloud.sql.connector import Connector

            # Automatically uses Cloud Run service account (or local GOOGLE_APPLICATION_CREDENTIALS)
            self.connector = Connector()
            logger.info("Cloud SQL Connector initialized successfully")

        except Exception as e:
            logger.error(f"Failed to initialize Cloud SQL connector: {e}")
            raise
    
    def _get_connection(self):
        """Create a SQLAlchemy engine using the Cloud SQL Unix socket."""
        try:
            db_socket_dir = os.getenv("DB_SOCKET_DIR", "/cloudsql")

            engine = sqlalchemy.create_engine(
                sqlalchemy.engine.url.URL.create(
                    drivername="postgresql+pg8000",
                    username=DB_USER,
                    password=DB_PASS,
                    database=DB_NAME,
                    query={"unix_sock": f"{db_socket_dir}/{INSTANCE_CONNECTION_NAME}/.s.PGSQL.5432"},
                ),
                pool_pre_ping=True,
                pool_size=5,
                max_overflow=2,
            )

            logger.info(f"Connected to Cloud SQL instance via Unix socket: {INSTANCE_CONNECTION_NAME}")
            return engine

        except Exception as e:
            logger.error(f"Failed to create Cloud SQL connection: {e}")
            raise
    
    def get_engine(self):
        """Get or create a SQLAlchemy engine for the Cloud SQL instance"""
        if self._engine is None:
            try:
                #self._engine = sqlalchemy.create_engine(
                #    "postgresql+pg8000://",
                #    creator=self._get_connection,
                #    pool_size=5,
                #    max_overflow=2,
                #    pool_timeout=30,
                #    pool_recycle=1800,
                #)
                self._engine = self._get_connection()

                logger.info("SQLAlchemy engine created successfully")
            except Exception as e:
                logger.error(f"Failed to create SQLAlchemy engine: {e}")
                raise
        
        return self._engine
    
    @contextmanager
    def get_connection_context(self):
        """Context manager for database connections"""
        engine = self.get_engine()
        connection = engine.connect()
        try:
            yield connection
        finally:
            connection.close()
    
    def execute_query(self, query: str, params: Optional[dict] = None):
        """Execute a SQL query and return results"""
        try:
            with self.get_connection_context() as conn:
                result = conn.execute(text(query), params or {})
                return result.fetchall()
        except Exception as e:
            logger.error(f"Query execution failed: {e}")
            raise
    
    def close(self):
        """Close the connector and clean up resources"""
        if self.connector:
            self.connector.close()
            logger.info("Cloud SQL connector closed")
        
        if self.credentials_path and os.path.exists(self.credentials_path):
            os.unlink(self.credentials_path)
            logger.info(f"Cleaned up credentials file: {self.credentials_path}")


cloudsql_connection = CloudSQLConnection()

try:
    with cloudsql_connection.get_connection_context() as conn:
        conn.execute(text("SELECT 1"))
        logger.info("✅ Cloud SQL connection test succeeded.")
except Exception as e:
    logger.error(f"❌ Cloud SQL connection test failed: {e}")

