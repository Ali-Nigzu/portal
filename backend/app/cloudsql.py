"""
Cloud SQL Connection Module for Nigzsu Analytics
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

INSTANCE_CONNECTION_NAME = "nigzsu:us-central1:nigzsutestdb"
DB_USER = "postgres"
DB_NAME = "postgres"


class CloudSQLConnection:
    """Manages Cloud SQL connections using service account authentication"""
    
    def __init__(self):
        self.connector = None
        self._engine = None
        self._initialize_connector()
    
    def _initialize_connector(self):
        """Initialize the Cloud SQL connector with service account credentials"""
        try:
            credentials_json = os.environ.get('GOOGLE_CLOUD_KEY')
            if not credentials_json:
                raise ValueError("GOOGLE_CLOUD_KEY environment variable not set")
            
            credentials_dict = json.loads(credentials_json)
            
            os.environ['GOOGLE_APPLICATION_CREDENTIALS_JSON'] = credentials_json
            
            self.connector = Connector()
            logger.info("Cloud SQL Connector initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize Cloud SQL connector: {e}")
            raise
    
    def _get_connection(self):
        """Create a database connection using the Cloud SQL connector"""
        try:
            credentials_json = os.environ.get('GOOGLE_CLOUD_KEY')
            credentials_dict = json.loads(credentials_json)
            
            import tempfile
            with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
                f.write(credentials_json)
                temp_cred_path = f.name
            
            os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = temp_cred_path
            
            conn = self.connector.connect(
                INSTANCE_CONNECTION_NAME,
                "pg8000",
                user=DB_USER,
                password=os.environ.get('DB_PASS'),
                db=DB_NAME
            )
            
            logger.info(f"Connected to Cloud SQL instance: {INSTANCE_CONNECTION_NAME}")
            return conn
            
        except Exception as e:
            logger.error(f"Failed to create Cloud SQL connection: {e}")
            raise
    
    def get_engine(self):
        """Get or create a SQLAlchemy engine for the Cloud SQL instance"""
        if self._engine is None:
            try:
                self._engine = sqlalchemy.create_engine(
                    "postgresql+pg8000://",
                    creator=self._get_connection,
                    pool_size=5,
                    max_overflow=2,
                    pool_timeout=30,
                    pool_recycle=1800,
                )
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


cloudsql_connection = CloudSQLConnection()
