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
import uuid
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
ALARM_LOGS_FILE = 'alarm_logs.json'
DEVICE_LISTS_FILE = 'device_lists.json'

security = HTTPBasic()

# In-memory token storage for view tokens
# Format: {token: {client_id: str, expires_at: datetime, used_count: int}}
view_tokens: Dict[str, Dict[str, Any]] = {}

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

class CreateUserRequest(BaseModel):
    username: str
    password: str
    name: str
    role: str
    csv_url: Optional[str] = None

class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    csv_url: Optional[str] = None

class CreateViewTokenRequest(BaseModel):
    client_id: str

class ViewTokenResponse(BaseModel):
    token: str
    expires_at: str
    client_id: str

class AlarmEvent(BaseModel):
    id: str
    instance: str
    device: str
    description: str
    alarmStartedAt: str
    alarmClearedAfter: Optional[str] = None
    severity: str
    client_id: str

class CreateAlarmRequest(BaseModel):
    instance: str
    device: str
    description: str
    alarmStartedAt: str
    alarmClearedAfter: Optional[str] = None
    severity: str
    client_id: str

class UpdateAlarmRequest(BaseModel):
    instance: Optional[str] = None
    device: Optional[str] = None
    description: Optional[str] = None
    alarmStartedAt: Optional[str] = None
    alarmClearedAfter: Optional[str] = None
    severity: Optional[str] = None

class DeviceInfo(BaseModel):
    id: str
    name: str
    type: str
    status: str
    lastSeen: str
    dataSource: Optional[str] = None
    location: Optional[str] = None
    recordCount: Optional[int] = None
    client_id: str

class CreateDeviceRequest(BaseModel):
    name: str
    type: str
    status: str
    lastSeen: str
    dataSource: Optional[str] = None
    location: Optional[str] = None
    recordCount: Optional[int] = None
    client_id: str

class UpdateDeviceRequest(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = None
    lastSeen: Optional[str] = None
    dataSource: Optional[str] = None
    location: Optional[str] = None
    recordCount: Optional[int] = None

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
                "name": "System Administrator",
                "last_login": None
            },
            "client1": {
                "password": hash_password("client123"),
                "role": "client",
                "name": "Test Client 1",
                "csv_url": "https://docs.google.com/spreadsheets/d/1B6Kg19ONObAmXliyuQNTL0-fh-6ueXOY_amadASZ1W4/export?format=csv&gid=368477740",
                "last_login": None
            },
            "client2": {
                "password": hash_password("client456"), 
                "role": "client",
                "name": "Test Client 2",
                "csv_url": "https://docs.google.com/spreadsheets/d/10oFKUDhiKjAIqTaJyCa20r9lbTdSgjPK4HwmdCplUgU/export?format=csv",
                "last_login": None
            }
        }
        with open(USERS_FILE, 'w') as f:
            json.dump(users_data, f, indent=2)
        return users_data
    
    with open(USERS_FILE, 'r') as f:
        users = json.load(f)
    
    # Migrate existing users to add last_login if missing
    modified = False
    for username, user_data in users.items():
        if 'last_login' not in user_data:
            user_data['last_login'] = None
            modified = True
    
    if modified:
        save_users(users)
    
    return users

def save_users(users_data: dict):
    """Save users data to JSON file"""
    with open(USERS_FILE, 'w') as f:
        json.dump(users_data, f, indent=2)

def load_alarm_logs():
    """Load alarm logs from JSON file"""
    if not os.path.exists(ALARM_LOGS_FILE):
        return {}
    with open(ALARM_LOGS_FILE, 'r') as f:
        return json.load(f)

def save_alarm_logs(alarm_data: dict):
    """Save alarm logs to JSON file"""
    with open(ALARM_LOGS_FILE, 'w') as f:
        json.dump(alarm_data, f, indent=2)

def load_device_lists():
    """Load device lists from JSON file"""
    if not os.path.exists(DEVICE_LISTS_FILE):
        return {}
    with open(DEVICE_LISTS_FILE, 'r') as f:
        return json.load(f)

def save_device_lists(device_data: dict):
    """Save device lists to JSON file"""
    with open(DEVICE_LISTS_FILE, 'w') as f:
        json.dump(device_data, f, indent=2)

def create_view_token(client_id: str) -> Dict[str, Any]:
    """Create a view token for a client"""
    token = str(uuid.uuid4())
    expires_at = datetime.now() + timedelta(hours=24)
    
    view_tokens[token] = {
        'client_id': client_id,
        'expires_at': expires_at,
        'used_count': 0
    }
    
    logger.info(f"Created view token for client: {client_id}")
    return {
        'token': token,
        'expires_at': expires_at.isoformat(),
        'client_id': client_id
    }

def validate_view_token(token: str) -> Optional[Dict[str, Any]]:
    """Validate a view token and return client info if valid"""
    clean_expired_tokens()
    
    if token not in view_tokens:
        return None
    
    token_data = view_tokens[token]
    
    if datetime.now() > token_data['expires_at']:
        del view_tokens[token]
        return None
    
    token_data['used_count'] += 1
    
    # Effectively unlimited uses for simplified token management
    if token_data['used_count'] > 999999:
        del view_tokens[token]
        return None
    
    return token_data

def clean_expired_tokens():
    """Remove expired tokens from storage"""
    now = datetime.now()
    expired = [token for token, data in view_tokens.items() if now > data['expires_at']]
    for token in expired:
        del view_tokens[token]
    if expired:
        logger.info(f"Cleaned {len(expired)} expired tokens")

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
    
    # Update last login timestamp
    users[username]['last_login'] = datetime.now().isoformat()
    save_users(users)
    
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
        
        # Update last login timestamp
        users[username]['last_login'] = datetime.now().isoformat()
        save_users(users)
        
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

@app.post("/api/admin/create-view-token", response_model=ViewTokenResponse)
async def create_admin_view_token(
    token_request: CreateViewTokenRequest,
    user: dict = Depends(authenticate_user)
):
    """Create a temporary view token for a client (admin only)"""
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    users = load_users()
    
    if token_request.client_id not in users:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if users[token_request.client_id]['role'] != 'client':
        raise HTTPException(status_code=400, detail="Can only create view tokens for client users")
    
    token_data = create_view_token(token_request.client_id)
    
    return ViewTokenResponse(**token_data)

@app.get("/api/view-dashboard/{token}")
async def get_view_dashboard_info(token: str):
    """Validate view token and return client information"""
    token_data = validate_view_token(token)
    
    if not token_data:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    users = load_users()
    client_id = token_data['client_id']
    
    if client_id not in users:
        raise HTTPException(status_code=404, detail="Client not found")
    
    client_data = users[client_id]
    
    return {
        'client_id': client_id,
        'name': client_data['name'],
        'csv_url': client_data.get('csv_url', ''),
        'token_valid': True
    }

@app.get("/api/chart-data", response_model=ChartDataResponse)
async def get_chart_data(
    request: Request,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    gender: Optional[str] = None,
    age_group: Optional[str] = None,
    event: Optional[str] = None,
    view_token: Optional[str] = None
):
    """
    Get intelligent chart data with auto-scaling and smart aggregation
    Supports both authenticated users and view tokens
    """
    try:
        csv_url = None
        
        if view_token:
            token_data = validate_view_token(view_token)
            if not token_data:
                raise HTTPException(status_code=401, detail="Invalid or expired view token")
            
            users = load_users()
            client_id = token_data['client_id']
            
            if client_id not in users:
                raise HTTPException(status_code=404, detail="Client not found")
            
            csv_url = users[client_id].get('csv_url')
            if not csv_url:
                raise HTTPException(status_code=400, detail="No CSV configured for this client")
        
        else:
            auth_header = request.headers.get('Authorization')
            if not auth_header or not auth_header.startswith('Basic '):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication required",
                    headers={"WWW-Authenticate": "Basic"},
                )
            
            try:
                credentials = HTTPBasicCredentials(
                    username=auth_header.split(' ')[1].split(':')[0] if ':' in auth_header.split(' ')[1] else '',
                    password=auth_header.split(' ')[1].split(':')[1] if ':' in auth_header.split(' ')[1] else ''
                )
                import base64
                decoded = base64.b64decode(auth_header.split(' ')[1]).decode('utf-8')
                username, password = decoded.split(':', 1)
                credentials = HTTPBasicCredentials(username=username, password=password)
                
                users = load_users()
                if username not in users or not verify_password(password, users[username]['password']):
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid credentials",
                        headers={"WWW-Authenticate": "Basic"},
                    )
                
                user = {
                    'username': username,
                    'role': users[username]['role'],
                    'name': users[username]['name'],
                    'csv_url': users[username].get('csv_url')
                }
                
                users[username]['last_login'] = datetime.now().isoformat()
                save_users(users)
                
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid credentials",
                    headers={"WWW-Authenticate": "Basic"},
                )
            
            if user['role'] == 'client':
                csv_url = user['csv_url']
                if not csv_url:
                    raise HTTPException(status_code=400, detail="No CSV configured for this user")
            else:
                client_id = request.query_params.get('client_id')
                if client_id:
                    if client_id in users and 'csv_url' in users[client_id]:
                        csv_url = users[client_id]['csv_url']
                    else:
                        raise HTTPException(status_code=400, detail="Invalid client ID or no CSV configured")
                else:
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

@app.get("/api/admin/users")
async def admin_get_users(user: dict = Depends(authenticate_user)):
    """Get all users with last_login times (admin only)"""
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    users = load_users()
    safe_users = {}
    for username, user_data in users.items():
        safe_users[username] = {
            'name': user_data['name'],
            'role': user_data['role'],
            'csv_url': user_data.get('csv_url', ''),
            'last_login': user_data.get('last_login')
        }
    
    return {'users': safe_users}

@app.post("/api/admin/users")
async def admin_create_user(
    create_request: CreateUserRequest,
    user: dict = Depends(authenticate_user)
):
    """Create new user (admin only)"""
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    users = load_users()
    
    if create_request.username in users:
        return {'success': False, 'error': 'Username already exists'}
    
    if create_request.role not in ['admin', 'client']:
        return {'success': False, 'error': 'Role must be either admin or client'}
    
    # Create new user with hashed password
    new_user = {
        'password': hash_password(create_request.password),
        'name': create_request.name,
        'role': create_request.role,
        'last_login': None
    }
    
    if create_request.role == 'client' and create_request.csv_url:
        new_user['csv_url'] = create_request.csv_url
    
    users[create_request.username] = new_user
    save_users(users)
    
    logger.info(f"Admin created new user: {create_request.username}")
    return {'success': True, 'message': f'User {create_request.username} created successfully'}

@app.put("/api/admin/users/{username}")
async def admin_update_user(
    username: str,
    update_request: UpdateUserRequest,
    user: dict = Depends(authenticate_user)
):
    """Update existing user (admin only)"""
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    users = load_users()
    
    if username not in users:
        return {'success': False, 'error': 'User not found'}
    
    # Update user fields
    if update_request.name is not None:
        users[username]['name'] = update_request.name
    
    if update_request.password is not None and update_request.password.strip():
        users[username]['password'] = hash_password(update_request.password)
    
    if update_request.role is not None:
        if update_request.role not in ['admin', 'client']:
            return {'success': False, 'error': 'Role must be either admin or client'}
        users[username]['role'] = update_request.role
    
    if update_request.csv_url is not None:
        if users[username]['role'] == 'client':
            users[username]['csv_url'] = update_request.csv_url
        elif 'csv_url' in users[username]:
            del users[username]['csv_url']
    
    save_users(users)
    
    logger.info(f"Admin updated user: {username}")
    return {'success': True, 'message': f'User {username} updated successfully'}

@app.delete("/api/admin/users/{username}")
async def admin_delete_user(
    username: str,
    user: dict = Depends(authenticate_user)
):
    """Delete user (admin only)"""
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    users = load_users()
    
    if username not in users:
        return {'success': False, 'error': 'User not found'}
    
    # Prevent deleting the last admin
    if users[username]['role'] == 'admin':
        admin_count = sum(1 for u in users.values() if u['role'] == 'admin')
        if admin_count <= 1:
            return {'success': False, 'error': 'Cannot delete the last admin user'}
    
    del users[username]
    save_users(users)
    
    logger.info(f"Admin deleted user: {username}")
    return {'success': True, 'message': f'User {username} deleted successfully'}

@app.get("/api/alarm-logs")
async def get_alarm_logs(
    request: Request,
    view_token: Optional[str] = None,
    client_id: Optional[str] = None
):
    """Get alarm logs for a client (supports view tokens and authenticated users)"""
    alarm_data = load_alarm_logs()
    target_client = None
    
    # Check for view token first
    if view_token:
        token_data = validate_view_token(view_token)
        if not token_data:
            raise HTTPException(status_code=401, detail="Invalid or expired view token")
        target_client = token_data['client_id']
    else:
        # Fall back to Basic Auth
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Basic '):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
                headers={"WWW-Authenticate": "Basic"},
            )
        
        import base64
        try:
            decoded = base64.b64decode(auth_header.split(' ')[1]).decode('utf-8')
            username, password = decoded.split(':', 1)
            
            users = load_users()
            if username not in users or not verify_password(password, users[username]['password']):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid credentials",
                    headers={"WWW-Authenticate": "Basic"},
                )
            
            user_role = users[username]['role']
            if user_role == 'client':
                target_client = username
            elif user_role == 'admin' and client_id:
                target_client = client_id
            else:
                target_client = username
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
                headers={"WWW-Authenticate": "Basic"},
            )
    
    alarms = alarm_data.get(target_client, [])
    return {'alarms': alarms, 'client_id': target_client}

@app.post("/api/admin/alarm-logs")
async def create_alarm_log(
    create_request: CreateAlarmRequest,
    user: dict = Depends(authenticate_user)
):
    """Create a new alarm log (admin only)"""
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    alarm_data = load_alarm_logs()
    
    if create_request.client_id not in alarm_data:
        alarm_data[create_request.client_id] = []
    
    new_alarm = {
        'id': f"alarm-{str(uuid.uuid4())[:8]}",
        'instance': create_request.instance,
        'device': create_request.device,
        'description': create_request.description,
        'alarmStartedAt': create_request.alarmStartedAt,
        'alarmClearedAfter': create_request.alarmClearedAfter,
        'severity': create_request.severity,
        'client_id': create_request.client_id
    }
    
    alarm_data[create_request.client_id].append(new_alarm)
    save_alarm_logs(alarm_data)
    
    logger.info(f"Admin created alarm: {new_alarm['id']} for client: {create_request.client_id}")
    return {'success': True, 'alarm': new_alarm}

@app.put("/api/admin/alarm-logs/{alarm_id}")
async def update_alarm_log(
    alarm_id: str,
    update_request: UpdateAlarmRequest,
    user: dict = Depends(authenticate_user)
):
    """Update an existing alarm log (admin only)"""
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    alarm_data = load_alarm_logs()
    
    for client_id, alarms in alarm_data.items():
        for alarm in alarms:
            if alarm['id'] == alarm_id:
                if update_request.instance is not None:
                    alarm['instance'] = update_request.instance
                if update_request.device is not None:
                    alarm['device'] = update_request.device
                if update_request.description is not None:
                    alarm['description'] = update_request.description
                if update_request.alarmStartedAt is not None:
                    alarm['alarmStartedAt'] = update_request.alarmStartedAt
                if update_request.alarmClearedAfter is not None:
                    alarm['alarmClearedAfter'] = update_request.alarmClearedAfter
                if update_request.severity is not None:
                    alarm['severity'] = update_request.severity
                
                save_alarm_logs(alarm_data)
                logger.info(f"Admin updated alarm: {alarm_id}")
                return {'success': True, 'alarm': alarm}
    
    raise HTTPException(status_code=404, detail="Alarm not found")

@app.delete("/api/admin/alarm-logs/{alarm_id}")
async def delete_alarm_log(
    alarm_id: str,
    user: dict = Depends(authenticate_user)
):
    """Delete an alarm log (admin only)"""
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    alarm_data = load_alarm_logs()
    
    for client_id, alarms in alarm_data.items():
        for i, alarm in enumerate(alarms):
            if alarm['id'] == alarm_id:
                deleted_alarm = alarms.pop(i)
                save_alarm_logs(alarm_data)
                logger.info(f"Admin deleted alarm: {alarm_id}")
                return {'success': True, 'message': f'Alarm {alarm_id} deleted successfully'}
    
    raise HTTPException(status_code=404, detail="Alarm not found")

@app.get("/api/device-list")
async def get_device_list(
    request: Request,
    view_token: Optional[str] = None,
    client_id: Optional[str] = None
):
    """Get device list for a client (supports view tokens and authenticated users)"""
    device_data = load_device_lists()
    target_client = None
    
    # Check for view token first
    if view_token:
        token_data = validate_view_token(view_token)
        if not token_data:
            raise HTTPException(status_code=401, detail="Invalid or expired view token")
        target_client = token_data['client_id']
    else:
        # Fall back to Basic Auth
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Basic '):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
                headers={"WWW-Authenticate": "Basic"},
            )
        
        import base64
        try:
            decoded = base64.b64decode(auth_header.split(' ')[1]).decode('utf-8')
            username, password = decoded.split(':', 1)
            
            users = load_users()
            if username not in users or not verify_password(password, users[username]['password']):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid credentials",
                    headers={"WWW-Authenticate": "Basic"},
                )
            
            user_role = users[username]['role']
            if user_role == 'client':
                target_client = username
            elif user_role == 'admin' and client_id:
                target_client = client_id
            else:
                target_client = username
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
                headers={"WWW-Authenticate": "Basic"},
            )
    
    devices = device_data.get(target_client, [])
    return {'devices': devices, 'client_id': target_client}

@app.post("/api/admin/device-list")
async def create_device(
    create_request: CreateDeviceRequest,
    user: dict = Depends(authenticate_user)
):
    """Create a new device (admin only)"""
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    device_data = load_device_lists()
    
    if create_request.client_id not in device_data:
        device_data[create_request.client_id] = []
    
    new_device = {
        'id': f"device-{str(uuid.uuid4())[:8]}",
        'name': create_request.name,
        'type': create_request.type,
        'status': create_request.status,
        'lastSeen': create_request.lastSeen,
        'dataSource': create_request.dataSource,
        'location': create_request.location,
        'recordCount': create_request.recordCount,
        'client_id': create_request.client_id
    }
    
    device_data[create_request.client_id].append(new_device)
    save_device_lists(device_data)
    
    logger.info(f"Admin created device: {new_device['id']} for client: {create_request.client_id}")
    return {'success': True, 'device': new_device}

@app.put("/api/admin/device-list/{device_id}")
async def update_device(
    device_id: str,
    update_request: UpdateDeviceRequest,
    user: dict = Depends(authenticate_user)
):
    """Update an existing device (admin only)"""
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    device_data = load_device_lists()
    
    for client_id, devices in device_data.items():
        for device in devices:
            if device['id'] == device_id:
                if update_request.name is not None:
                    device['name'] = update_request.name
                if update_request.type is not None:
                    device['type'] = update_request.type
                if update_request.status is not None:
                    device['status'] = update_request.status
                if update_request.lastSeen is not None:
                    device['lastSeen'] = update_request.lastSeen
                if update_request.dataSource is not None:
                    device['dataSource'] = update_request.dataSource
                if update_request.location is not None:
                    device['location'] = update_request.location
                if update_request.recordCount is not None:
                    device['recordCount'] = update_request.recordCount
                
                save_device_lists(device_data)
                logger.info(f"Admin updated device: {device_id}")
                return {'success': True, 'device': device}
    
    raise HTTPException(status_code=404, detail="Device not found")

@app.delete("/api/admin/device-list/{device_id}")
async def delete_device(
    device_id: str,
    user: dict = Depends(authenticate_user)
):
    """Delete a device (admin only)"""
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    device_data = load_device_lists()
    
    for client_id, devices in device_data.items():
        for i, device in enumerate(devices):
            if device['id'] == device_id:
                deleted_device = devices.pop(i)
                save_device_lists(device_data)
                logger.info(f"Admin deleted device: {device_id}")
                return {'success': True, 'message': f'Device {device_id} deleted successfully'}
    
    raise HTTPException(status_code=404, detail="Device not found")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)