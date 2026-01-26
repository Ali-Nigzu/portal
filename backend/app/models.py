"""
Pydantic Data Models for camOS Analytics API
"""

from typing import Optional, Dict, List, Any, Literal
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    user: Dict[str, Any]
    message: str


class CreateUserRequest(BaseModel):
    username: str
    password: str
    name: str
    role: str
    org_id: Optional[str] = Field(default=None, alias="orgId")

    class Config:
        allow_population_by_field_name = True


class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    org_id: Optional[str] = Field(default=None, alias="orgId")

    class Config:
        allow_population_by_field_name = True


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


class DashboardWidget(BaseModel):
    id: str
    title: str
    kind: Literal["kpi", "chart"]
    chartSpecId: Optional[str] = None
    inlineSpec: Optional[Dict[str, Any]] = None
    fixtureId: Optional[str] = None
    layout: Optional[Dict[str, Any]] = None
    subtitle: Optional[str] = None
    locked: Optional[bool] = None


class DashboardTimeRangeOption(BaseModel):
    id: str
    label: str
    durationMinutes: Optional[int] = None
    bucket: Optional[str] = None
    allTime: Optional[bool] = False


class DashboardTimeControls(BaseModel):
    defaultTimeRangeId: str
    timezone: str
    options: List[DashboardTimeRangeOption]


class DashboardManifest(BaseModel):
    id: str
    orgId: str
    widgets: List[DashboardWidget]
    layout: Dict[str, Any]
    timeControls: Optional[DashboardTimeControls] = None

