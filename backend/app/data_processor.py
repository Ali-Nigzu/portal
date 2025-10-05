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
    """Intelligent data processor with Cloud SQL support using aggregation queries"""
    
    @staticmethod
    def get_aggregated_analytics(table_name: str, filters: Dict[str, Optional[str]] = None) -> Dict:
        """Get pre-aggregated analytics data from Cloud SQL using parameterized queries"""
        try:
            filters = filters or {}
            params = {}
            where_clauses = []
            dwell_where_clauses = []  # For dwell time, exclude event filter
            
            # Build parameterized WHERE clauses
            if filters.get('start_date'):
                where_clauses.append("timestamp >= :start_date")
                dwell_where_clauses.append("timestamp >= :start_date")
                params['start_date'] = filters['start_date']
            if filters.get('end_date'):
                where_clauses.append("timestamp <= :end_date")
                dwell_where_clauses.append("timestamp <= :end_date")
                params['end_date'] = filters['end_date']
            if filters.get('gender'):
                where_clauses.append("sex = :gender")
                dwell_where_clauses.append("sex = :gender")
                params['gender'] = filters['gender']
            if filters.get('age_group'):
                where_clauses.append("age_bucket = :age_group")
                dwell_where_clauses.append("age_bucket = :age_group")
                params['age_group'] = filters['age_group']
            if filters.get('event'):
                event_val = 1 if filters['event'] == 'entry' else 0
                where_clauses.append("event = :event")
                params['event'] = event_val
            
            where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
            dwell_where_sql = f"AND {' AND '.join(dwell_where_clauses)}" if dwell_where_clauses else ""
            
            with cloudsql_connection.get_connection_context() as conn:
                # Query 1: Basic stats
                stats_query = text(f"""
                SELECT 
                    COUNT(*) as total_records,
                    MIN(timestamp) as min_timestamp,
                    MAX(timestamp) as max_timestamp,
                    COUNT(CASE WHEN event = 1 THEN 1 END) as entries,
                    COUNT(CASE WHEN event = 0 THEN 1 END) as exits
                FROM {table_name}
                {where_sql}
                """)
                stats_df = pd.read_sql(stats_query, conn, params=params)
                
                # Query 2: Demographics
                demo_query = text(f"""
                SELECT 
                    sex,
                    age_bucket,
                    COUNT(*) as count
                FROM {table_name}
                {where_sql}
                GROUP BY sex, age_bucket
                """)
                demo_df = pd.read_sql(demo_query, conn, params=params)
                
                # Query 3: Hourly distribution
                hourly_query = text(f"""
                SELECT 
                    EXTRACT(HOUR FROM timestamp) as hour,
                    COUNT(*) as count
                FROM {table_name}
                {where_sql}
                GROUP BY hour
                ORDER BY hour
                """)
                hourly_df = pd.read_sql(hourly_query, conn, params=params)
                
                # Query 4: Actual event records (limited for performance, sorted by timestamp)
                limit = 10000  # Limit records to keep response size manageable
                records_query = text(f"""
                SELECT 
                    track_id,
                    event,
                    timestamp,
                    sex,
                    age_bucket
                FROM {table_name}
                {where_sql}
                ORDER BY timestamp DESC
                LIMIT {limit}
                """)
                records_df = pd.read_sql(records_query, conn, params=params)
                
                # Query 5: Dwell time (exclude event filter, use other filters only)
                dwell_query = text(f"""
                WITH entries AS (
                    SELECT track_id, MIN(timestamp) as entry_time
                    FROM {table_name}
                    WHERE event = 1 {dwell_where_sql}
                    GROUP BY track_id
                ),
                exits AS (
                    SELECT track_id, MAX(timestamp) as exit_time
                    FROM {table_name}
                    WHERE event = 0 {dwell_where_sql}
                    GROUP BY track_id
                )
                SELECT 
                    AVG(EXTRACT(EPOCH FROM (e.exit_time - en.entry_time)) / 60) as avg_dwell_minutes,
                    COUNT(*) as complete_sessions
                FROM entries en
                JOIN exits e ON en.track_id = e.track_id
                WHERE e.exit_time > en.entry_time
                """)
                # Only pass non-event params to dwell query
                dwell_params = {k: v for k, v in params.items() if k != 'event'}
                dwell_df = pd.read_sql(dwell_query, conn, params=dwell_params)
                
                logger.info(f"Loaded aggregated analytics for {table_name}")
                
                return {
                    'stats': stats_df,
                    'demographics': demo_df,
                    'hourly': hourly_df,
                    'records': records_df,
                    'dwell': dwell_df
                }
                
        except Exception as e:
            logger.error(f"Failed to load aggregated analytics from {table_name}: {e}")
            raise HTTPException(status_code=500, detail=f"Database query failed: {str(e)}")
    
    @staticmethod
    def transform_cloudsql_format(df: pd.DataFrame) -> pd.DataFrame:
        """Transform Cloud SQL data format to match expected analytics format"""
        df['track_number'] = df['track_id']
        
        df['event'] = df['event'].apply(lambda x: 'entry' if x == 1 else 'exit')
        
        df['age_estimate'] = df['age_bucket']
        
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        
        required_columns = ['index', 'track_number', 'event', 'timestamp', 'sex', 'age_estimate']
        df = df[required_columns]
        
        logger.info(f"Transformed {len(df)} records to analytics format")
        return df
    
    @staticmethod
    def process_timestamps(df: pd.DataFrame) -> pd.DataFrame:
        """Process timestamps - already in ISO format from Cloud SQL"""
        try:
            if 'timestamp' in df.columns:
                df['timestamp'] = pd.to_datetime(df['timestamp'], errors='coerce')
            
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
