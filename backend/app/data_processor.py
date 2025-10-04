"""
Intelligent Data Processor for Nigzsu Analytics
Supports Cloud SQL PostgreSQL data sources
"""

import pandas as pd
import numpy as np
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional
from fastapi import HTTPException
from sqlalchemy import text

from .models import DataIntelligence
from .cloudsql import cloudsql_connection

logger = logging.getLogger(__name__)


class DataProcessor:
    """Intelligent data processor with Cloud SQL support"""
    
    @staticmethod
    def load_table_data(table_name: str) -> pd.DataFrame:
        """Load and validate data from Cloud SQL table"""
        try:
            query = f"SELECT * FROM {table_name} ORDER BY index ASC"
            
            with cloudsql_connection.get_connection_context() as conn:
                df = pd.read_sql(query, conn)
            
            if len(df) == 0:
                raise ValueError(f"No data found in table {table_name}")
            
            df = DataProcessor.transform_cloudsql_format(df)
            
            logger.info(f"Loaded {len(df)} records from table {table_name}")
            return df
            
        except Exception as e:
            logger.error(f"Failed to load data from table {table_name}: {e}")
            raise HTTPException(status_code=500, detail=f"Database connection failed: {str(e)}")
    
    @staticmethod
    def transform_cloudsql_format(df: pd.DataFrame) -> pd.DataFrame:
        """Transform Cloud SQL data format to match expected analytics format"""
        df['track_number'] = df['track_id']
        
        df['event'] = df['event'].apply(lambda x: 'entry' if x == 1 else 'exit')
        
        age_bucket_map = {
            '0-4': '(0,8)',
            '5-13': '(0,8)',
            '14-25': '(17,25)',
            '26-45': '(25,40)',
            '46-65': '(40,60)',
            '66+': '(60+)'
        }
        df['age_estimate'] = df['age_bucket'].map(age_bucket_map)
        
        df['timestamp_iso'] = pd.to_datetime(df['timestamp'])
        df['timestamp'] = df['timestamp_iso'].dt.strftime('%M:%H:%d:%m:%Y')
        
        required_columns = ['index', 'track_number', 'event', 'timestamp', 'sex', 'age_estimate']
        df = df[required_columns]
        
        logger.info(f"Transformed {len(df)} records to analytics format")
        return df
    
    @staticmethod
    def process_timestamps(df: pd.DataFrame) -> pd.DataFrame:
        """Process timestamps with format mm:hh:dd:mm:yyyy"""
        try:
            if 'timestamp' in df.columns:
                df['timestamp'] = pd.to_datetime(df['timestamp'], format='%M:%H:%d:%m:%Y', errors='coerce')
            
            df['hour'] = df['timestamp'].dt.hour
            df['day_of_week'] = df['timestamp'].dt.day_name()
            df['date'] = df['timestamp'].dt.date
            
            df['hour'] = df['hour'].fillna(12)
            df['day_of_week'] = df['day_of_week'].fillna('Unknown')
            
            logger.info(f"Processed timestamps, {df['timestamp'].notna().sum()} valid timestamps")
            return df
            
        except Exception as e:
            logger.error(f"Timestamp processing failed: {e}")
            raise HTTPException(status_code=400, detail=f"Timestamp processing failed: {str(e)}")
    
    @staticmethod
    def analyze_data_intelligence(df: pd.DataFrame) -> DataIntelligence:
        """Analyze data to provide intelligent insights"""
        valid_timestamps = df['timestamp'].dropna()
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
        
        hourly_counts = df.groupby('hour').size()
        peak_hours = hourly_counts.nlargest(3).index.tolist()
        
        demographics_breakdown = {
            'gender': df['sex'].value_counts().to_dict(),
            'age_groups': df['age_estimate'].value_counts().to_dict(),
            'events': df['event'].value_counts().to_dict()
        }
        
        temporal_patterns = {
            'hourly_distribution': df.groupby('hour').size().to_dict(),
            'daily_distribution': df.groupby('day_of_week').size().to_dict(),
            'peak_times': {
                'hour': int(hourly_counts.idxmax()) if len(hourly_counts) > 0 else 12,
                'count': int(hourly_counts.max()) if len(hourly_counts) > 0 else 0
            }
        }
        
        return DataIntelligence(
            total_records=len(df),
            date_span_days=date_span_days,
            latest_timestamp=latest_timestamp,
            optimal_granularity=optimal_granularity,
            peak_hours=peak_hours,
            demographics_breakdown=demographics_breakdown,
            temporal_patterns=temporal_patterns
        )
    
    @staticmethod
    def apply_filters(df: pd.DataFrame, filters: Dict[str, Optional[str]]) -> pd.DataFrame:
        """Apply intelligent filters to the data"""
        filtered_df = df.copy()
        
        if 'start_date' in filters and filters['start_date']:
            filtered_df = filtered_df[filtered_df['timestamp'] >= pd.to_datetime(filters['start_date'])]
        
        if 'end_date' in filters and filters['end_date']:
            filtered_df = filtered_df[filtered_df['timestamp'] <= pd.to_datetime(filters['end_date'])]
        
        if 'gender' in filters and filters['gender']:
            filtered_df = filtered_df[filtered_df['sex'] == filters['gender']]
        
        if 'age_group' in filters and filters['age_group']:
            filtered_df = filtered_df[filtered_df['age_estimate'] == filters['age_group']]
        
        if 'event' in filters and filters['event']:
            filtered_df = filtered_df[filtered_df['event'] == filters['event']]
        
        logger.info(f"Applied filters, {len(filtered_df)} records remaining")
        return filtered_df
