"""
Nigzsu FastAPI Application
Modern Business Intelligence Dashboard with Smart Data Processing
"""

import os
import json
import pandas as pd
import numpy as np
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from fastapi import FastAPI, HTTPException, Depends, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import io
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Nigzsu Analytics API",
    description="Intelligent CCTV data analytics with auto-scaling insights",
    version="2.0.0"
)

# Production-ready CORS middleware
def get_allowed_origins():
    """Get allowed origins based on environment"""
    origins = []
    
    # Development origins
    if os.environ.get("NODE_ENV") != "production":
        origins.extend([
            "http://localhost:5000",
            "http://127.0.0.1:5000", 
            "http://0.0.0.0:5000",
            "http://localhost:3000",  # React dev server
        ])
    
    # Replit domain
    replit_domain = os.environ.get("REPLIT_DOMAINS", "")
    if replit_domain:
        origins.extend([
            f"https://{replit_domain}",
            f"http://{replit_domain}",
        ])
    
    # Google Cloud Run domain 
    cloud_run_service = os.environ.get("CLOUD_RUN_SERVICE_URL", "")
    if cloud_run_service:
        origins.append(cloud_run_service)
    
    # Custom production domain
    production_domain = os.environ.get("PRODUCTION_DOMAIN", "")
    if production_domain:
        origins.extend([
            f"https://{production_domain}",
            f"http://{production_domain}",
        ])
    
    # Filter out empty strings and return unique origins
    return list(set(origin for origin in origins if origin))

ALLOWED_ORIGINS = get_allowed_origins()

# Add CORS middleware with production settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With", "Accept"],
)

# Configuration
GCS_BUCKET = 'nigzsu_cdata-testclient1'
USERS_FILE = 'users.json'

security = HTTPBasic()

# Data Models
class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    user: Dict[str, Any]
    message: str

class ChartDataResponse(BaseModel):
    data: List[Dict[str, Any]]
    summary: Dict[str, Any]
    intelligence: Dict[str, Any]

class DataIntelligence(BaseModel):
    """Smart insights about the dataset"""
    total_records: int
    date_span_days: int
    latest_timestamp: Optional[datetime]
    optimal_granularity: str  # 'hourly', 'daily', 'weekly'
    peak_hours: List[int]
    demographics_breakdown: Dict[str, Any]
    temporal_patterns: Dict[str, Any]

# User Management (keeping compatible with existing)
def hash_password(password: str) -> str:
    """Hash password using SHA-256 with salt"""
    salt = secrets.token_hex(16)
    password_hash = hashlib.sha256((password + salt).encode()).hexdigest()
    return f"{salt}:{password_hash}"

def verify_password(password: str, stored_hash: str) -> bool:
    """Verify password against stored hash"""
    try:
        if ':' not in stored_hash:
            # Legacy plaintext password - verify directly but should be migrated
            return password == stored_hash
        salt, hash_part = stored_hash.split(':', 1)
        password_hash = hashlib.sha256((password + salt).encode()).hexdigest()
        return password_hash == hash_part
    except:
        return False

def load_users():
    """Load user credentials from JSON file"""
    if not os.path.exists(USERS_FILE):
        # Initialize with default users with hashed passwords
        users_data = {
            "admin": {
                "password": hash_password("admin123"),
                "role": "admin",
                "name": "System Administrator"
            },
            "client1": {
                "password": hash_password("client123"),
                "role": "client",
                "name": "Test Client 1",
                "csv_url": "https://docs.google.com/spreadsheets/d/1B6Kg19ONObAmXliyuQNTL0-fh-6ueXOY_amadASZ1W4/export?format=csv&gid=368477740"
            },
            "client2": {
                "password": hash_password("client456"), 
                "role": "client",
                "name": "Test Client 2",
                "csv_url": "https://docs.google.com/spreadsheets/d/10oFKUDhiKjAIqTaJyCa20r9lbTdSgjPK4HwmdCplUgU/export?format=csv"
            }
        }
        with open(USERS_FILE, 'w') as f:
            json.dump(users_data, f, indent=2)
        return users_data
    
    with open(USERS_FILE, 'r') as f:
        return json.load(f)

def authenticate_user(credentials: HTTPBasicCredentials = Depends(security)):
    """Authenticate user and return user info using secure password verification"""
    users = load_users()
    username = credentials.username
    password = credentials.password
    
    if username not in users or not verify_password(password, users[username]['password']):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    
    return {
        'username': username,
        'role': users[username]['role'],
        'name': users[username]['name'],
        'csv_url': users[username].get('csv_url')
    }

class DataProcessor:
    """Intelligent CSV data processor with auto-scaling features"""
    
    @staticmethod
    def load_csv_data(csv_url: str) -> pd.DataFrame:
        """Load and validate CSV data"""
        try:
            # Load CSV with proper column names
            df = pd.read_csv(csv_url, header=None, 
                           names=['index', 'track_number', 'event', 'timestamp', 'sex', 'age_estimate'])
            
            if len(df) == 0:
                raise ValueError("Empty CSV file")
                
            logger.info(f"Loaded {len(df)} records from CSV")
            return df
        except Exception as e:
            logger.error(f"Failed to load CSV data: {e}")
            # Return demo data as fallback
            return DataProcessor.generate_demo_data()
    
    @staticmethod
    def generate_demo_data() -> pd.DataFrame:
        """Generate demo CCTV data for testing"""
        import random
        
        # Generate sample data
        base_time = datetime.now() - timedelta(days=7)
        data = []
        
        age_groups = ['(0,8)', '(9,16)', '(17,25)', '(25,40)', '(40,60)', '(60+)']
        genders = ['M', 'F']
        events = ['entry', 'exit']
        
        for i in range(1000):  # Generate more demo data
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
                'timestamp': timestamp.strftime('%M:%H:%d:%m:%Y'),  # Format: mm:hh:dd:mm:yyyy
                'sex': random.choice(genders),
                'age_estimate': random.choice(age_groups)
            })
        
        return pd.DataFrame(data)
    
    @staticmethod
    def process_timestamps(df: pd.DataFrame) -> pd.DataFrame:
        """Process timestamps with format mm:hh:dd:mm:yyyy"""
        try:
            # Parse timestamps with correct format (no seconds)
            df['timestamp'] = pd.to_datetime(df['timestamp'], format='%M:%H:%d:%m:%Y', errors='coerce')
            
            # Create derived time columns
            df['hour'] = df['timestamp'].dt.hour
            df['day_of_week'] = df['timestamp'].dt.day_name()
            df['date'] = df['timestamp'].dt.date
            
            # For invalid timestamps, use defaults
            df['hour'] = df['hour'].fillna(12)  # Default to noon
            df['day_of_week'] = df['day_of_week'].fillna('Unknown')
            
            logger.info(f"Processed timestamps, {df['timestamp'].notna().sum()} valid timestamps")
            return df
            
        except Exception as e:
            logger.error(f"Timestamp processing failed: {e}")
            raise HTTPException(status_code=400, detail=f"Timestamp processing failed: {str(e)}")
    
    @staticmethod
    def analyze_data_intelligence(df: pd.DataFrame) -> DataIntelligence:
        """Analyze data to provide intelligent insights"""
        # Find latest timestamp as "current time" reference
        valid_timestamps = df['timestamp'].dropna()
        latest_timestamp = valid_timestamps.max() if len(valid_timestamps) > 0 else None
        earliest_timestamp = valid_timestamps.min() if len(valid_timestamps) > 0 else None
        
        # Calculate date span
        date_span_days = 0
        if latest_timestamp and earliest_timestamp:
            date_span_days = (latest_timestamp - earliest_timestamp).days
        
        # Determine optimal granularity
        optimal_granularity = "hourly"
        if date_span_days > 30:
            optimal_granularity = "weekly"
        elif date_span_days > 7:
            optimal_granularity = "daily"
        
        # Find peak hours
        hourly_counts = df.groupby('hour').size()
        peak_hours = hourly_counts.nlargest(3).index.tolist()
        
        # Demographics breakdown
        demographics_breakdown = {
            'gender': df['sex'].value_counts().to_dict(),
            'age_groups': df['age_estimate'].value_counts().to_dict(),
            'events': df['event'].value_counts().to_dict()
        }
        
        # Temporal patterns
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
        
        # Date range filters
        if 'start_date' in filters and filters['start_date']:
            filtered_df = filtered_df[filtered_df['timestamp'] >= pd.to_datetime(filters['start_date'])]
        
        if 'end_date' in filters and filters['end_date']:
            filtered_df = filtered_df[filtered_df['timestamp'] <= pd.to_datetime(filters['end_date'])]
        
        # Demographic filters
        if 'gender' in filters and filters['gender']:
            filtered_df = filtered_df[filtered_df['sex'] == filters['gender']]
        
        if 'age_group' in filters and filters['age_group']:
            filtered_df = filtered_df[filtered_df['age_estimate'] == filters['age_group']]
        
        if 'event' in filters and filters['event']:
            filtered_df = filtered_df[filtered_df['event'] == filters['event']]
        
        logger.info(f"Applied filters, {len(filtered_df)} records remaining")
        return filtered_df

# API Endpoints
@app.get("/")
async def root():
    """API health check"""
    return {"message": "Nigzsu Analytics API v2.0", "status": "healthy"}

@app.post("/api/login", response_model=LoginResponse)
async def login(login_request: LoginRequest):
    """Authentication endpoint for user login"""
    try:
        users = load_users()
        username = login_request.username
        password = login_request.password
        
        if username not in users:
            raise HTTPException(status_code=401, detail="Invalid username or password")
        
        user_data = users[username]
        if not verify_password(password, user_data['password']):
            raise HTTPException(status_code=401, detail="Invalid username or password")
        
        # Return user info without password
        safe_user = {
            'username': username,
            'role': user_data['role'],
            'name': user_data['name'],
            'csv_url': user_data.get('csv_url', '')
        }
        
        return LoginResponse(
            user=safe_user,
            message="Login successful"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/chart-data", response_model=ChartDataResponse)
async def get_chart_data(
    request: Request,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    gender: Optional[str] = None,
    age_group: Optional[str] = None,
    event: Optional[str] = None,
    user: dict = Depends(authenticate_user)
):
    """
    Get intelligent chart data with auto-scaling and smart aggregation
    """
    try:
        # Get CSV URL for user
        csv_url = None
        if user['role'] == 'client':
            csv_url = user['csv_url']
            if not csv_url:
                raise HTTPException(status_code=400, detail="No CSV configured for this user")
        else:
            # Admin can specify client_id
            client_id = request.query_params.get('client_id')
            if client_id:
                users = load_users()
                if client_id in users and 'csv_url' in users[client_id]:
                    csv_url = users[client_id]['csv_url']
                else:
                    raise HTTPException(status_code=400, detail="Invalid client ID or no CSV configured")
            else:
                # Default to first available client for admin
                users = load_users()
                for username, user_data in users.items():
                    if user_data.get('role') == 'client' and 'csv_url' in user_data:
                        csv_url = user_data['csv_url']
                        break
        
        if not csv_url:
            raise HTTPException(status_code=400, detail="No CSV data source available")
        
        # Load and process data
        df = DataProcessor.load_csv_data(csv_url)
        df = DataProcessor.process_timestamps(df)
        
        # Apply filters
        filters = {
            'start_date': start_date,
            'end_date': end_date,
            'gender': gender,
            'age_group': age_group,
            'event': event
        }
        filtered_df = DataProcessor.apply_filters(df, filters)
        
        # Generate intelligence insights
        intelligence = DataProcessor.analyze_data_intelligence(filtered_df)
        
        # Convert to records for frontend
        records = filtered_df.fillna('').to_dict(orient='records')
        data_records: List[Dict[str, Any]] = [dict(record) for record in records]
        
        # Create summary
        summary = {
            'total_records': len(filtered_df),
            'filtered_from': len(df),
            'date_range': {
                'start': filtered_df['timestamp'].min().isoformat() if len(filtered_df) > 0 and filtered_df['timestamp'].notna().any() else None,
                'end': filtered_df['timestamp'].max().isoformat() if len(filtered_df) > 0 and filtered_df['timestamp'].notna().any() else None
            },
            'latest_timestamp': intelligence.latest_timestamp.isoformat() if intelligence.latest_timestamp else None
        }
        
        return ChartDataResponse(
            data=data_records,
            summary=summary,
            intelligence=intelligence.dict()
        )
        
    except Exception as e:
        logger.error(f"Chart data error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/users")
async def get_users(user: dict = Depends(authenticate_user)):
    """Get users list (admin only)"""
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    users = load_users()
    # Remove passwords from response
    safe_users = {}
    for username, user_data in users.items():
        safe_users[username] = {
            'role': user_data['role'],
            'name': user_data['name'],
            'csv_url': user_data.get('csv_url', '')
        }
    
    return safe_users

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)