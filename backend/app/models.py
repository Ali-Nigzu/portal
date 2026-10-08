"""
Pydantic Data Models for camOS Analytics API
"""

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    username: str = Field(max_length=320)
    password: str = Field(max_length=1024)


class LoginResponse(BaseModel):
    user: Dict[str, Any]
    message: str


class AuthUser(BaseModel):
    id: str
    name: str
    email: str
    phone: Optional[str] = None


class CreateAccountRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(max_length=320)
    phone: Optional[str] = Field(default=None, max_length=32)
    password: str = Field(max_length=1024)

    model_config = ConfigDict(extra="forbid")


class EmailLoginRequest(BaseModel):
    email: str = Field(max_length=320)
    password: str = Field(max_length=1024)


class IdentifierLoginRequest(BaseModel):
    identifier: str = Field(max_length=320)
    password: str = Field(max_length=1024)


class AuthUserResponse(BaseModel):
    user: AuthUser


class CreateUserRequest(BaseModel):
    username: str
    password: str
    name: str
    role: str
    org_id: Optional[str] = Field(default=None, alias="orgId")

    model_config = ConfigDict(populate_by_name=True)


class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    org_id: Optional[str] = Field(default=None, alias="orgId")

    model_config = ConfigDict(populate_by_name=True)


class CreateViewTokenRequest(BaseModel):
    client_id: str


class ViewTokenResponse(BaseModel):
    token: str
    expires_at: str
    client_id: str


class SignupStartResponse(BaseModel):
    ok: bool
    email: str
    expiresInSeconds: int
    resendCooldownSeconds: int


class SignupVerifyRequest(BaseModel):
    email: str = Field(max_length=320)
    code: str = Field(max_length=16)

    model_config = ConfigDict(extra="forbid")



class SignupResendRequest(BaseModel):
    email: str = Field(max_length=320)

    model_config = ConfigDict(extra="forbid")



class SignupResendResponse(BaseModel):
    ok: bool
    expiresInSeconds: int
    resendCooldownSeconds: int
    resendsRemaining: int


class PasswordResetStartRequest(BaseModel):
    email: str = Field(max_length=320)

    model_config = ConfigDict(extra="forbid")



class PasswordResetStartResponse(BaseModel):
    ok: bool
    email: str
    expiresInSeconds: int
    resendCooldownSeconds: int


class PasswordResetResendRequest(BaseModel):
    email: str = Field(max_length=320)

    model_config = ConfigDict(extra="forbid")



class PasswordResetResendResponse(BaseModel):
    ok: bool
    expiresInSeconds: int
    resendCooldownSeconds: int
    resendsRemaining: int


class PasswordResetVerifyRequest(BaseModel):
    email: str = Field(max_length=320)
    code: str = Field(max_length=16)

    model_config = ConfigDict(extra="forbid")



class PasswordResetVerifyResponse(BaseModel):
    ok: bool
    resetExpiresInSeconds: int


class PasswordResetSetPasswordRequest(BaseModel):
    email: str = Field(max_length=320)
    password: str = Field(max_length=1024)
    confirm_password: str = Field(max_length=1024)

    model_config = ConfigDict(extra="forbid")



class PasswordResetSetPasswordResponse(BaseModel):
    ok: bool




class SettingsUnlockStartRequest(BaseModel):
    current_password: str = Field(max_length=1024)

    model_config = ConfigDict(extra="forbid")



class SettingsUnlockStartResponse(BaseModel):
    ok: bool
    expiresInSeconds: int
    resendCooldownSeconds: int


class SettingsUnlockVerifyRequest(BaseModel):
    code: str = Field(max_length=16)

    model_config = ConfigDict(extra="forbid")



class SettingsUnlockVerifyResponse(BaseModel):
    ok: bool
    unlockToken: str
    unlockExpiresInSeconds: int


class SettingsUnlockResendResponse(BaseModel):
    ok: bool
    expiresInSeconds: int
    resendCooldownSeconds: int
    resendsRemaining: int


class UpdateMeRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=32)
    password: Optional[str] = Field(default=None, max_length=1024)
    confirm_password: Optional[str] = Field(default=None, max_length=1024)
    unlock_token: str = Field(max_length=128)

    model_config = ConfigDict(extra="forbid")


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


class ContactResponse(BaseModel):
    message: str


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
