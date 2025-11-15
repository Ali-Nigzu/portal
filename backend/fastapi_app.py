"""
camOS FastAPI Application
Modern Business Intelligence Dashboard with Smart Data Processing
"""

import os
import json
import uuid
import base64
import logging
import pandas as pd
from datetime import datetime
from typing import Optional, Dict, List, Any

from cachetools import TTLCache
from fastapi import FastAPI, HTTPException, Depends, status, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from backend.app import auth


from backend.app.models import (
    LoginRequest,
    LoginResponse,
    ChartDataResponse,
    DataIntelligence,
    CreateUserRequest,
    UpdateUserRequest,
    CreateViewTokenRequest,
    ViewTokenResponse,
    AlarmEvent,
    CreateAlarmRequest,
    UpdateAlarmRequest,
    DeviceInfo,
    CreateDeviceRequest,
    UpdateDeviceRequest,
    RegisterInterestRequest,
    RegisterInterestResponse,
    DashboardManifest,
    PinDashboardWidgetRequest,
)
from backend.app.analytics.dashboard_catalogue import (
    ManifestValidationError,
    get_dashboard_manifest,
    pin_widget_to_manifest,
    remove_widget_from_manifest,
)
from backend.app.auth import (
    hash_password,
    verify_password,
    authenticate_user,
    security
)
from backend.app.database import (
    load_users,
    save_users,
    load_alarm_logs,
    save_alarm_logs,
    load_device_lists,
    save_device_lists,
    get_active_table_name
)
from backend.app.config import (
    get_allowed_origins,
    USERS_FILE,
    ALARM_LOGS_FILE,
    DEVICE_LISTS_FILE,
    INTEREST_SUBMISSIONS_FILE,
    GCS_BUCKET
)
from backend.app.view_tokens import (
    create_view_token,
    validate_view_token,
    view_tokens
)
from backend.app.data_processor import DataProcessor, _resolve_time_bounds
from backend.app.bigquery_client import BigQueryDataFrameError, bigquery_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="camOS Analytics API",
    description="Intelligent CCTV data analytics with auto-scaling insights",
    version="2.0.0"
)
#app.include_router(auth.router, prefix="/api")

ANALYTICS_CACHE_TTL = int(os.getenv("ANALYTICS_CACHE_TTL", "120"))
analytics_cache: TTLCache = TTLCache(maxsize=128, ttl=ANALYTICS_CACHE_TTL)

ALLOWED_ORIGINS = get_allowed_origins()

@app.on_event("startup")
async def startup_health_check():
    """Run a lightweight BigQuery connectivity check on startup."""
    try:
        bigquery_client.run_health_check()
    except Exception as exc:
        logger.error("BigQuery startup health check failed: %s", exc)
        raise

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With", "Accept"],
)


#@app.get("/")
#async def root():
#    """API health check"""
#    return {"message": "camOS Analytics API v2.0", "status": "healthy"}


@app.post("/api/register-interest", response_model=RegisterInterestResponse)
async def register_interest(submission: RegisterInterestRequest):
    """Register interest form submission endpoint"""
    try:
        if os.path.exists(INTEREST_SUBMISSIONS_FILE):
            with open(INTEREST_SUBMISSIONS_FILE, 'r') as f:
                submissions = json.load(f)
        else:
            submissions = []
        
        submission_id = str(uuid.uuid4())
        submission_data = {
            'id': submission_id,
            'name': submission.name,
            'email': submission.email,
            'company': submission.company,
            'phone': submission.phone,
            'business_type': submission.business_type,
            'message': submission.message,
            'submitted_at': datetime.now().isoformat()
        }
        
        submissions.append(submission_data)
        
        os.makedirs(os.path.dirname(INTEREST_SUBMISSIONS_FILE), exist_ok=True)
        with open(INTEREST_SUBMISSIONS_FILE, 'w') as f:
            json.dump(submissions, f, indent=2)
        
        logger.info(f"New interest submission from {submission.email} at {submission.company}")
        
        return RegisterInterestResponse(
            message="Thank you for your interest! We'll be in touch soon.",
            submission_id=submission_id
        )
        
    except Exception as e:
        logger.error(f"Interest submission error: {e}")
        raise HTTPException(status_code=500, detail="Unable to process submission")


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
        
        users[username]['last_login'] = datetime.now().isoformat()
        save_users(users)
        
        safe_user = {
            'username': username,
            'role': user_data['role'],
            'name': user_data['name'],
            'table_name': user_data.get('table_name', '')
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
        'table_name': client_data.get('table_name', ''),
        'token_valid': True
    }


def _authenticate_chart_data_request(request: Request, view_token: Optional[str]) -> str:
    """Helper function to authenticate chart data requests (view token or Basic auth)"""
    if view_token:
        token_data = validate_view_token(view_token)
        if not token_data:
            raise HTTPException(status_code=401, detail="Invalid or expired view token")
        
        users = load_users()
        client_id = token_data['client_id']
        
        if client_id not in users:
            raise HTTPException(status_code=404, detail="Client not found")
        
        table_name = get_active_table_name(client_id, users)
        if not table_name:
            raise HTTPException(status_code=400, detail="No table configured for this client")
        return table_name
    
    else:
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Basic '):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required"
            )
        
        try:
            decoded = base64.b64decode(auth_header.split(' ')[1]).decode('utf-8')
            username, password = decoded.split(':', 1)
            
            users = load_users()
            if username not in users or not verify_password(password, users[username]['password']):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid credentials"
                )
            
            table_name = get_active_table_name(username, users)
            if not table_name:
                raise HTTPException(status_code=400, detail="No table configured for this user")
            return table_name
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )


@app.get("/api/chart-data", response_model=ChartDataResponse)
async def get_chart_data(
    request: Request,
    kpi_start_date: Optional[str] = None,
    kpi_end_date: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    gender: Optional[str] = None,
    age_group: Optional[str] = None,
    event: Optional[str] = None,
    view_token: Optional[str] = None
):
    """Return analytics payload backed by BigQuery aggregations."""
    try:
        table_name = _authenticate_chart_data_request(request, view_token)

        kpi_filters = {
            'start_date': kpi_start_date or start_date,
            'end_date': kpi_end_date or end_date,
            'gender': gender,
            'age_group': age_group,
            'event': event,
        }

        chart_filters = {
            'start_date': start_date,
            'end_date': end_date,
            'gender': gender,
            'age_group': age_group,
            'event': event,
        }

        cache_key = json.dumps(
            {
                'table': table_name,
                'kpi': kpi_filters,
                'chart': chart_filters,
            },
            sort_keys=True,
        )

        cached_response = analytics_cache.get(cache_key)
        if cached_response is not None:
            logger.debug("Analytics cache hit for key %s", cache_key)
            return cached_response

        agg_data = DataProcessor.get_aggregated_analytics(table_name, kpi_filters)

        stats_df = agg_data['stats']
        stats = stats_df.iloc[0] if not stats_df.empty else None

        def _to_datetime(value):
            if value is None or (hasattr(pd, 'isna') and pd.isna(value)):
                return None
            if isinstance(value, pd.Timestamp):
                return value.to_pydatetime()
            if isinstance(value, datetime):
                return value
            return pd.to_datetime(value).to_pydatetime()

        def _to_iso(value):
            dt_value = _to_datetime(value)
            return dt_value.isoformat() if dt_value else None

        total_records = 0
        min_dt = None
        max_dt = None
        entries = exits = 0
        if stats is not None:
            total_records = int(stats['total_records']) if not pd.isna(stats['total_records']) else 0
            min_dt = _to_datetime(stats['min_timestamp'])
            max_dt = _to_datetime(stats['max_timestamp'])
            entries = int(stats['entries']) if not pd.isna(stats['entries']) else 0
            exits = int(stats['exits']) if not pd.isna(stats['exits']) else 0

        gender_counts: Dict[str, int] = {}
        age_counts: Dict[str, int] = {}
        for _, row in agg_data['demographics'].iterrows():
            gender_counts[row['sex']] = gender_counts.get(row['sex'], 0) + int(row['count'])
            age_counts[row['age_bucket']] = age_counts.get(row['age_bucket'], 0) + int(row['count'])

        hourly_dist = {
            int(row['hour']): int(row['count'])
            for _, row in agg_data['hourly'].iterrows()
        }
        peak_hour = max(hourly_dist.items(), key=lambda x: x[1])[0] if hourly_dist else 12
        peak_hours = sorted(hourly_dist.items(), key=lambda x: x[1], reverse=True)[:3]
        peak_hours_list = [int(hour) for hour, _ in peak_hours]

        date_span_days = 0
        if min_dt and max_dt:
            date_span_days = (max_dt - min_dt).days

        optimal_granularity = 'hourly'
        if date_span_days > 30:
            optimal_granularity = 'weekly'
        elif date_span_days > 7:
            optimal_granularity = 'daily'

        avg_dwell = 0.0
        dwell_df = agg_data['dwell']
        if not dwell_df.empty:
            dwell_value = dwell_df.iloc[0]['avg_dwell_minutes']
            if not pd.isna(dwell_value):
                avg_dwell = float(dwell_value)

        chart_data: List[Dict[str, Any]] = []
        for _, row in agg_data['records'].iterrows():
            timestamp = pd.to_datetime(row['timestamp'])
            chart_data.append({
                'timestamp': timestamp.isoformat(),
                'hour': int(timestamp.hour),
                'date': timestamp.date().isoformat(),
                'event': 'entry' if row['event'] == 1 else 'exit',
                'track_number': row['track_id'],
                'sex': row['sex'],
                'age_estimate': row['age_bucket'],
                'day_of_week': timestamp.strftime('%A'),
                'index': 0,
            })

        summary = {
            'total_records': total_records,
            'date_range': {
                'start': _to_iso(min_dt),
                'end': _to_iso(max_dt),
            },
            'demographics': {
                'gender': gender_counts,
                'age_groups': age_counts,
            },
        }

        intelligence = {
            'total_records': total_records,
            'date_span_days': date_span_days,
            'latest_timestamp': _to_iso(max_dt),
            'optimal_granularity': optimal_granularity,
            'peak_hours': peak_hours_list,
            'demographics_breakdown': {
                'gender': gender_counts,
                'age_groups': age_counts,
                'events': {'entry': entries, 'exit': exits},
            },
            'temporal_patterns': {
                'hourly_distribution': hourly_dist,
                'daily_distribution': {},
                'peak_times': {
                    'hour': peak_hour,
                    'count': hourly_dist.get(peak_hour, 0),
                },
            },
            'avg_dwell_minutes': avg_dwell,
        }

        response = ChartDataResponse(
            data=chart_data,
            summary=summary,
            intelligence=intelligence,
        )

        analytics_cache[cache_key] = response
        return response

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Chart data error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to process chart data: {exc}")


@app.get("/api/search-events")
async def search_events(
    request: Request,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    event_type: Optional[str] = None,
    sex: Optional[str] = None,
    age: Optional[str] = None,
    track_id: Optional[str] = None,
    page: int = 1,
    per_page: int = 20,
    view_token: Optional[str] = None
):
    """Search BigQuery event logs with pagination."""
    try:
        table_name = _authenticate_chart_data_request(request, view_token)

        filters: Dict[str, Optional[str]] = {
            'start_date': start_date,
            'end_date': end_date,
        }
        params = _resolve_time_bounds(filters)

        where_conditions = ['timestamp BETWEEN @start_ts AND @end_ts']

        if event_type and event_type.lower() != 'all':
            params['event'] = 1 if event_type.lower() == 'entry' else 0
            where_conditions.append('event = @event')
        if sex and sex.lower() != 'all':
            params['sex'] = sex
            where_conditions.append('sex = @sex')
        if age and age.lower() != 'all':
            params['age'] = age
            where_conditions.append('age_bucket = @age')
        if track_id:
            params['track_id'] = f"%{track_id}%"
            where_conditions.append('track_id LIKE @track_id')

        where_sql = 'WHERE ' + ' AND '.join(where_conditions)

        offset = max(page - 1, 0) * per_page

        table_identifier = f"`{table_name}`"

        count_query = f"""
            SELECT COUNT(*) AS total
            FROM {table_identifier}
            {where_sql}
        """
        count_df = bigquery_client.query_dataframe(
            count_query, params, job_context=f"{table_name}::search_count"
        )
        total_count = int(count_df.iloc[0]['total']) if not count_df.empty else 0

        search_params = dict(params)
        search_params['limit'] = per_page
        search_params['offset'] = offset

        search_query = f"""
            SELECT
                track_id,
                event,
                timestamp,
                sex,
                age_bucket
            FROM {table_identifier}
            {where_sql}
            ORDER BY timestamp DESC
            LIMIT @limit OFFSET @offset
        """
        results_df = bigquery_client.query_dataframe(
            search_query, search_params, job_context=f"{table_name}::search_results"
        )

        events: List[Dict[str, Any]] = []
        for _, row in results_df.iterrows():
            timestamp = pd.to_datetime(row['timestamp'])
            events.append({
                'track_number': row['track_id'],
                'event': 'entry' if row['event'] == 1 else 'exit',
                'timestamp': timestamp.isoformat(),
                'sex': row['sex'],
                'age_estimate': row['age_bucket'],
            })

        return {
            'events': events,
            'total': total_count,
            'page': page,
            'per_page': per_page,
            'total_pages': (total_count + per_page - 1) // per_page,
        }

    except BigQueryDataFrameError as exc:
        logger.error(
            "Event search failed for %s (job_id=%s): %s", table_name, exc.job_id, exc
        )
        raise HTTPException(
            status_code=502,
            detail={
                "message": "BigQuery dataframe conversion failed",
                "job_id": exc.job_id,
            },
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Event search error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to search events: {exc}")
@app.get("/api/admin/users")
async def get_users(user: dict = Depends(authenticate_user)):
    """Get all users (admin only)"""
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    users = load_users()
    
    safe_users = []
    for username, user_data in users.items():
        safe_users.append({
            'username': username,
            'name': user_data['name'],
            'role': user_data['role'],
            'table_name': user_data.get('table_name', ''),
            'last_login': user_data.get('last_login'),
            'data_sources': user_data.get('data_sources', [])
        })
    
    return {'users': safe_users}


@app.post("/api/admin/users")
async def create_user(
    create_request: CreateUserRequest,
    user: dict = Depends(authenticate_user)
):
    """Create a new user (admin only)"""
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    users = load_users()
    
    if create_request.username in users:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    users[create_request.username] = {
        'password': hash_password(create_request.password),
        'name': create_request.name,
        'role': create_request.role,
        'table_name': create_request.table_name or '',
        'last_login': None,
        'data_sources': []
    }
    
    save_users(users)
    
    logger.info(f"Admin created user: {create_request.username}")
    return {'success': True, 'message': f'User {create_request.username} created successfully'}


@app.put("/api/admin/users/{username}")
async def update_user(
    username: str,
    update_request: UpdateUserRequest,
    user: dict = Depends(authenticate_user)
):
    """Update an existing user (admin only)"""
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    users = load_users()
    
    if username not in users:
        raise HTTPException(status_code=404, detail="User not found")
    
    if update_request.name is not None:
        users[username]['name'] = update_request.name
    if update_request.password is not None:
        users[username]['password'] = hash_password(update_request.password)
    if update_request.role is not None:
        users[username]['role'] = update_request.role
    if update_request.table_name is not None:
        users[username]['table_name'] = update_request.table_name
    
    save_users(users)
    
    logger.info(f"Admin updated user: {username}")
    return {'success': True, 'message': f'User {username} updated successfully'}


@app.delete("/api/admin/users/{username}")
async def delete_user(
    username: str,
    user: dict = Depends(authenticate_user)
):
    """Delete a user (admin only)"""
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if username == user['username']:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    
    users = load_users()
    
    if username not in users:
        raise HTTPException(status_code=404, detail="User not found")
    
    del users[username]
    save_users(users)
    
    logger.info(f"Admin deleted user: {username}")
    return {'success': True, 'message': f'User {username} deleted successfully'}


@app.get("/api/admin/data-sources/{client_id}")
async def get_data_sources(
    client_id: str,
    user: dict = Depends(authenticate_user)
):
    """Get data sources for a client (admin only)"""
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    users = load_users()
    
    if client_id not in users:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if users[client_id]['role'] != 'client':
        raise HTTPException(status_code=400, detail="User is not a client")
    
    data_sources = users[client_id].get('data_sources', [])
    
    return {'data_sources': data_sources, 'client_id': client_id}


@app.post("/api/admin/data-sources/{client_id}")
async def add_data_source(
    client_id: str,
    request: Dict[str, Any],
    user: dict = Depends(authenticate_user)
):
    """Add a data source for a client (admin only)"""
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    users = load_users()
    
    if client_id not in users:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if users[client_id]['role'] != 'client':
        raise HTTPException(status_code=400, detail="User is not a client")
    
    title = request.get('title', '').strip()
    url = request.get('url', '').strip()
    source_type = request.get('type', 'Camera')
    
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    if not (url.startswith('http://') or url.startswith('https://')):
        raise HTTPException(status_code=400, detail="URL must start with http:// or https://")
    
    if 'data_sources' not in users[client_id]:
        users[client_id]['data_sources'] = []
    
    existing_sources = users[client_id]['data_sources']
    source_id = f"source_{len(existing_sources) + 1}"
    
    is_first_source = len(existing_sources) == 0
    new_source = {
        'id': source_id,
        'title': title,
        'url': url,
        'type': source_type,
        'active': is_first_source
    }
    
    users[client_id]['data_sources'].append(new_source)
    save_users(users)
    
    logger.info(f"Admin added data source {source_id} for client {client_id}")
    return {'success': True, 'message': 'Data source added successfully', 'source': new_source}


@app.put("/api/admin/data-sources/{client_id}/{source_id}")
async def update_data_source(
    client_id: str,
    source_id: str,
    request: Dict[str, Any],
    user: dict = Depends(authenticate_user)
):
    """Update a data source for a client (admin only)"""
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    users = load_users()
    
    if client_id not in users:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if users[client_id]['role'] != 'client':
        raise HTTPException(status_code=400, detail="User is not a client")
    
    data_sources = users[client_id].get('data_sources', [])
    
    if 'title' in request and not request['title'].strip():
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    if 'url' in request:
        url = request['url'].strip()
        if not url:
            raise HTTPException(status_code=400, detail="URL cannot be empty")
        if not (url.startswith('http://') or url.startswith('https://')):
            raise HTTPException(status_code=400, detail="URL must start with http:// or https://")
    if 'type' in request and request['type'] not in ['Camera', 'Sensor', 'Gateway']:
        raise HTTPException(status_code=400, detail="Type must be Camera, Sensor, or Gateway")
    
    source_found = False
    for source in data_sources:
        if source['id'] == source_id:
            if 'title' in request:
                source['title'] = request['title'].strip()
            if 'url' in request:
                source['url'] = request['url'].strip()
            if 'type' in request:
                source['type'] = request['type']
            source_found = True
            break
    
    if not source_found:
        raise HTTPException(status_code=404, detail="Data source not found")
    
    save_users(users)
    
    logger.info(f"Admin updated data source {source_id} for client {client_id}")
    return {'success': True, 'message': 'Data source updated successfully'}


@app.delete("/api/admin/data-sources/{client_id}/{source_id}")
async def delete_data_source(
    client_id: str,
    source_id: str,
    user: dict = Depends(authenticate_user)
):
    """Delete a data source for a client (admin only)"""
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    users = load_users()
    
    if client_id not in users:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if users[client_id]['role'] != 'client':
        raise HTTPException(status_code=400, detail="User is not a client")
    
    data_sources = users[client_id].get('data_sources', [])
    
    was_active = False
    for source in data_sources:
        if source['id'] == source_id and source.get('active', False):
            was_active = True
            break
    
    initial_length = len(data_sources)
    users[client_id]['data_sources'] = [s for s in data_sources if s['id'] != source_id]
    
    if len(users[client_id]['data_sources']) == initial_length:
        raise HTTPException(status_code=404, detail="Data source not found")
    
    for idx, source in enumerate(users[client_id]['data_sources']):
        source['id'] = f"source_{idx + 1}"
    
    if was_active and len(users[client_id]['data_sources']) > 0:
        users[client_id]['data_sources'][0]['active'] = True
    
    save_users(users)
    
    logger.info(f"Admin deleted data source {source_id} for client {client_id}")
    return {'success': True, 'message': 'Data source deleted successfully'}


@app.post("/api/admin/data-sources/{client_id}/{source_id}/set-active")
async def set_active_data_source(
    client_id: str,
    source_id: str,
    user: dict = Depends(authenticate_user)
):
    """Set a data source as active for a client (admin only)"""
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    users = load_users()
    
    if client_id not in users:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if users[client_id]['role'] != 'client':
        raise HTTPException(status_code=400, detail="User is not a client")
    
    data_sources = users[client_id].get('data_sources', [])
    
    source_found = False
    for source in data_sources:
        if source['id'] == source_id:
            source['active'] = True
            source_found = True
        else:
            source['active'] = False
    
    if not source_found:
        raise HTTPException(status_code=404, detail="Data source not found")
    
    save_users(users)
    
    logger.info(f"Admin set data source {source_id} as active for client {client_id}")
    return {'success': True, 'message': 'Data source activated successfully'}


@app.get("/api/alarm-logs")
async def get_alarm_logs(
    request: Request,
    view_token: Optional[str] = None,
    client_id: Optional[str] = None
):
    """Get alarm logs for a client (supports view tokens and authenticated users)"""
    alarm_data = load_alarm_logs()
    target_client = None
    
    if view_token:
        token_data = validate_view_token(view_token)
        if not token_data:
            raise HTTPException(status_code=401, detail="Invalid or expired view token")
        target_client = token_data['client_id']
    else:
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Basic '):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required"
            )
        
        try:
            decoded = base64.b64decode(auth_header.split(' ')[1]).decode('utf-8')
            username, password = decoded.split(':', 1)
            
            users = load_users()
            if username not in users or not verify_password(password, users[username]['password']):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid credentials"
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
                detail="Invalid credentials"
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
    
    if view_token:
        token_data = validate_view_token(view_token)
        if not token_data:
            raise HTTPException(status_code=401, detail="Invalid or expired view token")
        target_client = token_data['client_id']
    else:
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Basic '):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required"
            )
        
        try:
            decoded = base64.b64decode(auth_header.split(' ')[1]).decode('utf-8')
            username, password = decoded.split(':', 1)
            
            users = load_users()
            if username not in users or not verify_password(password, users[username]['password']):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid credentials"
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
                detail="Invalid credentials"
            )
    
    devices = device_data.get(target_client, [])
    
    users = load_users()
    data_sources = []
    if target_client and target_client in users:
        data_sources = users[target_client].get('data_sources', [])
    
    return {'devices': devices, 'client_id': target_client, 'data_sources': data_sources}


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


# Dashboard manifest API
@app.get("/api/dashboards/{dashboard_id}", response_model=DashboardManifest)
async def fetch_dashboard_manifest(
    dashboard_id: str,
    org_id: str = Query(..., alias="orgId"),
):
    """Return the dashboard manifest for the requested organisation."""
    try:
        return get_dashboard_manifest(org_id=org_id, dashboard_id=dashboard_id)
    except KeyError as exc:
        raise HTTPException(
            status_code=404,
            detail={"error": "manifest_not_found", "message": str(exc)},
        )


@app.post("/api/dashboards/{dashboard_id}/widgets", response_model=DashboardManifest)
async def pin_dashboard_widget(
    dashboard_id: str,
    request: PinDashboardWidgetRequest,
    org_id: str = Query(..., alias="orgId"),
):
    """Persist a widget inside the manifest for the given organisation."""
    try:
        manifest = pin_widget_to_manifest(
            org_id=org_id,
            dashboard_id=dashboard_id,
            widget=request.widget.dict(exclude_none=True),
            position=request.position or "end",
            target_band=request.targetBand,
        )
        return manifest
    except KeyError as exc:
        raise HTTPException(
            status_code=404,
            detail={"error": "manifest_not_found", "message": str(exc)},
        )
    except ManifestValidationError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "manifest_validation", "message": str(exc)},
        )


@app.delete("/api/dashboards/{dashboard_id}/widgets/{widget_id}", response_model=DashboardManifest)
async def unpin_dashboard_widget(
    dashboard_id: str,
    widget_id: str,
    org_id: str = Query(..., alias="orgId"),
):
    """Remove a widget from the manifest for the given organisation."""
    try:
        return remove_widget_from_manifest(
            org_id=org_id,
            widget_id=widget_id,
            dashboard_id=dashboard_id,
        )
    except KeyError as exc:
        raise HTTPException(
            status_code=404,
            detail={"error": "manifest_not_found", "message": str(exc)},
        )
    except ManifestValidationError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "manifest_validation", "message": str(exc)},
        )


# Serve static assets from /static
app.mount("/static", StaticFiles(directory="backend/frontend_build/static"), name="static")

# Serve root index
@app.get("/")
async def serve_index():
    index_path = os.path.join("backend/frontend_build", "index.html")
    if not os.path.exists(index_path):
        raise HTTPException(status_code=500, detail="index.html not found")
    return FileResponse(index_path)

# Catch-all for non-API, non-static paths -> return index.html so React router handles it
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    # Prevent API/static paths from being handled by SPA fallback
    if full_path.startswith("api") or full_path.startswith("static"):
        raise HTTPException(status_code=404, detail="API or static route not found")
    index_path = os.path.join("backend/frontend_build", "index.html")
    if not os.path.exists(index_path):
        raise HTTPException(status_code=500, detail="index.html not found")
    return FileResponse(index_path)


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)


