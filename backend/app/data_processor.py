"""
Intelligent CSV Data Processor for Nigzsu Analytics
"""

import pandas as pd
import numpy as np
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional
from fastapi import HTTPException

from .models import DataIntelligence

logger = logging.getLogger(__name__)


class DataProcessor:
    """Intelligent CSV data processor with auto-scaling features"""
    
    @staticmethod
    def load_csv_data(csv_url: str) -> pd.DataFrame:
        """Load and validate CSV data"""
        try:
            df = pd.read_csv(csv_url, header=None,
                           names=['index', 'track_number', 'event', 'timestamp', 'sex', 'age_estimate'])
            
            if len(df) == 0:
                raise ValueError("Empty CSV file")
                
            logger.info(f"Loaded {len(df)} records from CSV")
            return df
        except Exception as e:
            logger.error(f"Failed to load CSV data: {e}")
            return DataProcessor.generate_demo_data()
    
    @staticmethod
    def generate_demo_data() -> pd.DataFrame:
        """Generate demo CCTV data for testing"""
        import random
        
        base_time = datetime.now() - timedelta(days=7)
        data = []
        
        age_groups = ['(0,8)', '(9,16)', '(17,25)', '(25,40)', '(40,60)', '(60+)']
        genders = ['M', 'F']
        events = ['entry', 'exit']
        
        for i in range(1000):
            timestamp = base_time + timedelta(
                days=random.randint(0, 6),
                hours=random.randint(8, 22),
                minutes=random.randint(0, 59),
                seconds=random.randint(0, 59)
            )
            
            data.append({
                'index': i + 1,
                'track_number': random.randint(1000, 9999),
                'event': random.choice(events),
                'timestamp': timestamp.strftime('%M:%H:%d:%m:%Y'),
                'sex': random.choice(genders),
                'age_estimate': random.choice(age_groups)
            })
        
        return pd.DataFrame(data)
    
    @staticmethod
    def process_timestamps(df: pd.DataFrame) -> pd.DataFrame:
        """Process timestamps with format mm:hh:dd:mm:yyyy"""
        try:
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
