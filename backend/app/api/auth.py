"""Authentication and public endpoints."""

from __future__ import annotations

import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response

from backend.app.auth import (
    clear_auth_cookie,
    create_session_token,
    get_session_user,
    hash_session_token,
    set_auth_cookie,
    verify_password,
)
from backend.app.data.json_store import (
    create_account_user,
    find_user_by_email,
    load_users,
    normalize_email,
    save_users,
)
from backend.app.models import (
    AuthUser,
    AuthUserResponse,
    CreateAccountRequest,
    EmailLoginRequest,
    LoginRequest,
    LoginResponse,
    RegisterInterestRequest,
    RegisterInterestResponse,
)
from backend.app.services.auth_context import org_id_for_user_record
from backend.app.config import INTEREST_SUBMISSIONS_FILE

router = APIRouter()
logger = logging.getLogger(__name__)
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PHONE_RE = re.compile(r"^\+[1-9]\d{6,14}$")


def _validate_email(email: str) -> str:
    normalized = normalize_email(email)
    if not normalized:
        raise HTTPException(status_code=422, detail="This field is required")
    if not EMAIL_RE.match(normalized):
        raise HTTPException(status_code=422, detail="Not a valid email address")
    return normalized


def _safe_auth_user(user_data: dict) -> AuthUser:
    return AuthUser(
        id=user_data["id"],
        name=user_data["name"],
        email=user_data["email"],
        phone=user_data.get("phone"),
    )


@router.post("/api/register-interest", response_model=RegisterInterestResponse)
async def register_interest(submission: RegisterInterestRequest):
    """Register interest form submission endpoint."""
    try:
        if os.path.exists(INTEREST_SUBMISSIONS_FILE):
            with open(INTEREST_SUBMISSIONS_FILE, "r") as f:
                submissions = json.load(f)
        else:
            submissions = []

        submission_id = str(uuid.uuid4())
        submission_data = {
            "id": submission_id,
            "name": submission.name,
            "email": submission.email,
            "company": submission.company,
            "phone": submission.phone,
            "business_type": submission.business_type,
            "message": submission.message,
            "submitted_at": datetime.now().isoformat(),
        }

        submissions.append(submission_data)

        os.makedirs(os.path.dirname(INTEREST_SUBMISSIONS_FILE), exist_ok=True)
        with open(INTEREST_SUBMISSIONS_FILE, "w") as f:
            json.dump(submissions, f, indent=2)

        logger.info("New interest submission from %s at %s", submission.email, submission.company)

        return RegisterInterestResponse(
            message="Thank you for your interest! We'll be in touch soon.",
            submission_id=submission_id,
        )

    except Exception as exc:
        logger.error("Interest submission error: %s", exc)
        raise HTTPException(status_code=500, detail="Unable to process submission") from exc


@router.post("/api/create-account", response_model=AuthUserResponse, status_code=201)
async def create_account(payload: CreateAccountRequest):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="This field is required")

    email = _validate_email(payload.email)

    phone = payload.phone.strip() if payload.phone else None
    if phone and not PHONE_RE.match(phone):
        raise HTTPException(status_code=422, detail="Not a valid phone number")

    if not payload.password:
        raise HTTPException(status_code=422, detail="This field is required")
    if len(payload.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")

    users = load_users()
    existing_username, _ = find_user_by_email(users, email)
    if existing_username:
        raise HTTPException(status_code=409, detail="Email already in use")

    username, user_data = create_account_user(users, name, email, phone, payload.password)
    user_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    users[username] = user_data
    save_users(users)
    return AuthUserResponse(user=_safe_auth_user(user_data))


@router.post("/api/login")
async def login(login_request: LoginRequest | EmailLoginRequest, response: Response):
    """Authentication endpoint for user login."""
    try:
        users = load_users()

        if hasattr(login_request, "email"):
            email = _validate_email(login_request.email)
            username, user_data = find_user_by_email(users, email)
            password = login_request.password
            if not username or not user_data:
                raise HTTPException(status_code=401, detail="Invalid email or password")
        else:
            username = login_request.username
            password = login_request.password
            user_data = users.get(username)
            if not user_data:
                raise HTTPException(status_code=401, detail="Invalid username or password")

        stored_hash = user_data.get("password_hash") or user_data.get("password", "")
        if not verify_password(password, stored_hash):
            if hasattr(login_request, "email"):
                raise HTTPException(status_code=401, detail="Invalid email or password")
            raise HTTPException(status_code=401, detail="Invalid username or password")

        users[username]["last_login"] = datetime.now(timezone.utc).isoformat()
        session_token = create_session_token()
        users[username]["session_token_hash"] = hash_session_token(session_token)
        users[username]["updated_at"] = datetime.now(timezone.utc).isoformat()
        save_users(users)
        set_auth_cookie(response, session_token)

        if hasattr(login_request, "email"):
            return AuthUserResponse(user=_safe_auth_user(users[username]))

        org_id = org_id_for_user_record(username, user_data)
        safe_user = {
            "username": username,
            "role": user_data["role"],
            "name": user_data["name"],
            "orgId": org_id,
            "org_id": org_id,
        }

        return LoginResponse(user=safe_user, message="Login successful")

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Login error: %s", exc)
        raise HTTPException(status_code=500, detail="Internal server error") from exc


@router.get("/api/me", response_model=AuthUserResponse)
async def me(session_user: tuple[str, dict] = Depends(get_session_user)):
    _, user_data = session_user
    return AuthUserResponse(user=_safe_auth_user(user_data))


@router.post("/api/logout", status_code=204)
async def logout(response: Response):
    clear_auth_cookie(response)
