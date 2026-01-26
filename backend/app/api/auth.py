"""Authentication and public endpoints."""

from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException

from backend.app.auth import verify_password
from backend.app.data.json_store import load_users, save_users
from backend.app.models import LoginRequest, LoginResponse, RegisterInterestRequest, RegisterInterestResponse
from backend.app.services.auth_context import org_id_for_user_record
from backend.app.config import INTEREST_SUBMISSIONS_FILE

router = APIRouter()
logger = logging.getLogger(__name__)


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


@router.post("/api/login", response_model=LoginResponse)
async def login(login_request: LoginRequest):
    """Authentication endpoint for user login."""
    try:
        users = load_users()
        username = login_request.username
        password = login_request.password

        if username not in users:
            raise HTTPException(status_code=401, detail="Invalid username or password")

        user_data = users[username]
        if not verify_password(password, user_data["password"]):
            raise HTTPException(status_code=401, detail="Invalid username or password")

        users[username]["last_login"] = datetime.now().isoformat()
        save_users(users)

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
