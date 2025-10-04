"""
Pydantic Data Models for Nigzsu Analytics API
"""

from datetime import datetime
from typing import Optional, Dict, List, Any
from pydantic import BaseModel


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
    optimal_granularity: str
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


class RegisterInterestRequest(BaseModel):
    name: str
    email: str
    company: str
    phone: Optional[str] = None
    business_type: Optional[str] = None
    message: Optional[str] = None


class RegisterInterestResponse(BaseModel):
    message: str
    submission_id: str


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


class DataSource(BaseModel):
    id: str
    title: str
    url: str
    type: str
    active: bool = False


class CreateDataSourceRequest(BaseModel):
    title: str
    url: str
    type: str
    client_id: str


class UpdateDataSourceRequest(BaseModel):
    title: Optional[str] = None
    url: Optional[str] = None
    type: Optional[str] = None
    active: Optional[bool] = None
