"""Authentication and public endpoints."""

from __future__ import annotations

import base64
import json
import logging
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile

from backend.app.auth import (
    clear_auth_cookie,
    create_session_token,
    get_session_user,
    hash_session_token,
    set_auth_cookie,
    verify_password,
)
from backend.app.config import INTEREST_SUBMISSIONS_FILE
from backend.app.data.json_store import (
    create_account_user,
    find_user_by_email,
    hash_password,
    load_pending_signups,
    load_users,
    normalize_email,
    save_pending_signups,
    save_users,
)
from backend.app.models import (
    AuthUser,
    AuthUserResponse,
    CreateAccountRequest,
    EmailLoginRequest,
    LoginRequest,
    LoginResponse,
    ContactResponse,
    RegisterInterestRequest,
    RegisterInterestResponse,
    SignupResendRequest,
    SignupResendResponse,
    SignupStartResponse,
    SignupVerifyRequest,
)
from backend.app.services.auth_context import org_id_for_user_record
from backend.app.services.postmark_email import (
    PostmarkConfigurationError,
    PostmarkDeliveryError,
    PostmarkAttachment,
    send_admin_contact_notification,
    send_admin_signup_notification,
    send_contact_confirmation_email,
    send_verification_email,
)

router = APIRouter()
logger = logging.getLogger(__name__)
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PHONE_RE = re.compile(r"^\+[1-9]\d{6,14}$")

SIGNUP_CODE_TTL_SECONDS = 15 * 60
SIGNUP_MAX_VERIFY_ATTEMPTS = 5
SIGNUP_RESEND_COOLDOWN_SECONDS = 30
SIGNUP_MAX_RESENDS = 5

CONTACT_MAX_FILES = 3
CONTACT_MAX_FILE_BYTES = 10 * 1024 * 1024
CONTACT_ALLOWED_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".csv", ".png", ".jpg", ".jpeg"}
CONTACT_ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "application/csv",
    "image/png",
    "image/jpeg",
}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _to_iso(timestamp: datetime) -> str:
    return timestamp.astimezone(timezone.utc).isoformat()


def _parse_iso(timestamp: str | None) -> datetime | None:
    if not timestamp:
        return None
    try:
        parsed = datetime.fromisoformat(timestamp)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


def _generate_verification_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _validate_email(email: str) -> str:
    normalized = normalize_email(email)
    if not normalized:
        raise HTTPException(status_code=422, detail="This field is required")
    if not EMAIL_RE.match(normalized):
        raise HTTPException(status_code=422, detail="Not a valid email address")
    return normalized


def _validate_signup_payload(payload: CreateAccountRequest) -> tuple[str, str, str | None]:
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

    return name, email, phone


def _safe_auth_user(user_data: dict) -> AuthUser:
    return AuthUser(
        id=user_data["id"],
        name=user_data["name"],
        email=user_data["email"],
        phone=user_data.get("phone"),
    )


def _prune_expired_pending_signups(pending_signups: dict, now: datetime) -> bool:
    to_delete: list[str] = []
    for email, record in pending_signups.items():
        expires_at = _parse_iso(record.get("code_expires_at"))
        if expires_at is None or expires_at <= now:
            to_delete.append(email)
    for email in to_delete:
        del pending_signups[email]
    return bool(to_delete)


def _load_pending_signups_pruned() -> tuple[dict, datetime, bool]:
    pending_signups = load_pending_signups()
    now = _utc_now()
    modified = _prune_expired_pending_signups(pending_signups, now)
    return pending_signups, now, modified


def _raise_mail_delivery_error(exc: Exception, *, request_id: str) -> None:
    if isinstance(exc, PostmarkConfigurationError):
        logger.error(
            "signup.email.config_error request_id=%s has_server_token=%s has_from_email=%s has_admin_notify_email=%s detail=%s",
            request_id,
            bool(os.getenv("POSTMARK_SERVER_TOKEN", "").strip()),
            bool(os.getenv("POSTMARK_FROM_EMAIL", "").strip()),
            bool(os.getenv("ADMIN_NOTIFY_EMAIL", "").strip()),
            str(exc),
        )
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if isinstance(exc, PostmarkDeliveryError):
        logger.error(
            "signup.email.delivery_error request_id=%s status_code=%s error_code=%s message=%s from_email=%s to_email=%s has_server_token=%s has_from_email=%s has_admin_notify_email=%s response_body=%s",
            request_id,
            exc.status_code,
            exc.error_code,
            exc.error_message,
            exc.from_email,
            exc.to_email_masked,
            bool(os.getenv("POSTMARK_SERVER_TOKEN", "").strip()),
            bool(os.getenv("POSTMARK_FROM_EMAIL", "").strip()),
            bool(os.getenv("ADMIN_NOTIFY_EMAIL", "").strip()),
            exc.response_body,
        )
        raise HTTPException(status_code=502, detail="Failed to send verification email.") from exc
    logger.exception("signup.email.unknown_error request_id=%s", request_id)
    raise HTTPException(status_code=502, detail="Failed to send verification email.") from exc


def _raise_contact_mail_delivery_error(exc: Exception, *, request_id: str) -> None:
    if isinstance(exc, PostmarkConfigurationError):
        logger.error(
            "contact.email.config_error request_id=%s has_server_token=%s has_from_email=%s has_admin_notify_email=%s detail=%s",
            request_id,
            bool(os.getenv("POSTMARK_SERVER_TOKEN", "").strip()),
            bool(os.getenv("POSTMARK_FROM_EMAIL", "").strip()),
            bool(os.getenv("ADMIN_NOTIFY_EMAIL", "").strip()),
            str(exc),
        )
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if isinstance(exc, PostmarkDeliveryError):
        logger.error(
            "contact.email.delivery_error request_id=%s status_code=%s error_code=%s message=%s from_email=%s to_email=%s has_server_token=%s has_from_email=%s has_admin_notify_email=%s response_body=%s",
            request_id,
            exc.status_code,
            exc.error_code,
            exc.error_message,
            exc.from_email,
            exc.to_email_masked,
            bool(os.getenv("POSTMARK_SERVER_TOKEN", "").strip()),
            bool(os.getenv("POSTMARK_FROM_EMAIL", "").strip()),
            bool(os.getenv("ADMIN_NOTIFY_EMAIL", "").strip()),
            exc.response_body,
        )
        raise HTTPException(status_code=502, detail="Failed to send contact message.") from exc
    logger.exception("contact.email.unknown_error request_id=%s", request_id)
    raise HTTPException(status_code=502, detail="Failed to send contact message.") from exc


def _validate_contact_fields(name: str, email: str, phone: str | None, message: str) -> tuple[str, str, str | None, str]:
    safe_name = name.strip()
    if not safe_name:
        raise HTTPException(status_code=422, detail="Name is required")

    safe_email = _validate_email(email)

    safe_phone = phone.strip() if phone else None
    if safe_phone and not PHONE_RE.match(safe_phone):
        raise HTTPException(status_code=422, detail="Not a valid phone number")

    safe_message = message.strip()
    if not safe_message:
        raise HTTPException(status_code=422, detail="Message is required")

    return safe_name, safe_email, safe_phone, safe_message


def _validate_contact_upload(content_type: str | None, filename: str, payload: bytes) -> None:
    extension = os.path.splitext(filename)[1].lower()
    normalized_type = (content_type or "").lower().strip()

    if extension not in CONTACT_ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=422, detail=f"Unsupported file type: {filename}")

    if normalized_type and normalized_type not in CONTACT_ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=422, detail=f"Unsupported file type: {filename}")

    if len(payload) > CONTACT_MAX_FILE_BYTES:
        raise HTTPException(status_code=422, detail=f"File exceeds 10MB limit: {filename}")


@router.post("/api/contact", response_model=ContactResponse)
async def submit_contact(
    name: str = Form(...),
    email: str = Form(...),
    phone: str | None = Form(default=None),
    message: str = Form(...),
    attachments: list[UploadFile] = File(default=[]),
):
    request_id = str(uuid.uuid4())
    safe_name, safe_email, safe_phone, safe_message = _validate_contact_fields(name, email, phone, message)

    if len(attachments) > CONTACT_MAX_FILES:
        raise HTTPException(status_code=422, detail="Upload up to 3 attachments.")

    postmark_attachments: list[PostmarkAttachment] = []
    attachment_names: list[str] = []

    for attachment in attachments:
        filename = (attachment.filename or "attachment").strip()
        payload = await attachment.read()
        _validate_contact_upload(attachment.content_type, filename, payload)

        postmark_attachments.append(
            PostmarkAttachment(
                name=filename,
                content_type=attachment.content_type or "application/octet-stream",
                content_base64=base64.b64encode(payload).decode("ascii"),
            )
        )
        attachment_names.append(filename)

    try:
        send_admin_contact_notification(
            name=safe_name,
            email=safe_email,
            phone=safe_phone,
            message=safe_message,
            attachment_names=attachment_names,
            attachments=postmark_attachments,
        )
    except Exception as exc:
        _raise_contact_mail_delivery_error(exc, request_id=request_id)

    try:
        send_contact_confirmation_email(to_email=safe_email, name=safe_name)
    except Exception:
        logger.exception(
            "contact.email.sender_confirmation_failed request_id=%s from_email=%s to_email=%s",
            request_id,
            bool(os.getenv("POSTMARK_FROM_EMAIL", "").strip()),
            safe_email,
        )

    return ContactResponse(message="Thanks for contacting us. We'll be in touch soon.")


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


@router.post("/api/signup/start", response_model=SignupStartResponse, status_code=202)
async def signup_start(payload: CreateAccountRequest):
    request_id = str(uuid.uuid4())
    name, email, phone = _validate_signup_payload(payload)

    users = load_users()
    existing_username, _ = find_user_by_email(users, email)
    if existing_username:
        raise HTTPException(status_code=409, detail="Email already in use")

    pending_signups, now, modified = _load_pending_signups_pruned()

    code = _generate_verification_code()
    now_iso = _to_iso(now)
    expires_at_iso = _to_iso(now + timedelta(seconds=SIGNUP_CODE_TTL_SECONDS))

    pending_signups[email] = {
        "name": name,
        "email": email,
        "phone": phone,
        "password_hash": hash_password(payload.password),
        "verification_code_hash": hash_password(code),
        "code_expires_at": expires_at_iso,
        "verify_attempts": 0,
        "resend_count": 0,
        "last_code_sent_at": now_iso,
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    try:
        send_verification_email(to_email=email, code=code)
    except Exception as exc:
        _raise_mail_delivery_error(exc, request_id=request_id)

    save_pending_signups(pending_signups)

    return SignupStartResponse(
        ok=True,
        email=email,
        expiresInSeconds=SIGNUP_CODE_TTL_SECONDS,
        resendCooldownSeconds=SIGNUP_RESEND_COOLDOWN_SECONDS,
    )


@router.post("/api/signup/resend", response_model=SignupResendResponse)
async def signup_resend(payload: SignupResendRequest):
    request_id = str(uuid.uuid4())
    email = _validate_email(payload.email)

    pending_signups, now, modified = _load_pending_signups_pruned()

    record = pending_signups.get(email)
    if not record:
        if modified:
            save_pending_signups(pending_signups)
        raise HTTPException(status_code=404, detail="No pending signup found for this email.")

    expires_at = _parse_iso(record.get("code_expires_at"))
    if not expires_at or expires_at <= now:
        del pending_signups[email]
        save_pending_signups(pending_signups)
        raise HTTPException(status_code=410, detail="Verification code expired. Please restart signup.")

    last_sent_at = _parse_iso(record.get("last_code_sent_at"))
    if last_sent_at and (now - last_sent_at).total_seconds() < SIGNUP_RESEND_COOLDOWN_SECONDS:
        if modified:
            save_pending_signups(pending_signups)
        raise HTTPException(status_code=429, detail="Please wait before requesting another code.")

    resend_count = int(record.get("resend_count", 0))
    if resend_count >= SIGNUP_MAX_RESENDS:
        if modified:
            save_pending_signups(pending_signups)
        raise HTTPException(status_code=429, detail="Maximum resend attempts reached.")

    code = _generate_verification_code()
    now_iso = _to_iso(now)
    record["verification_code_hash"] = hash_password(code)
    record["code_expires_at"] = _to_iso(now + timedelta(seconds=SIGNUP_CODE_TTL_SECONDS))
    record["resend_count"] = resend_count + 1
    record["last_code_sent_at"] = now_iso
    record["updated_at"] = now_iso

    try:
        send_verification_email(to_email=email, code=code)
    except Exception as exc:
        _raise_mail_delivery_error(exc, request_id=request_id)

    save_pending_signups(pending_signups)

    return SignupResendResponse(
        ok=True,
        expiresInSeconds=SIGNUP_CODE_TTL_SECONDS,
        resendCooldownSeconds=SIGNUP_RESEND_COOLDOWN_SECONDS,
        resendsRemaining=max(SIGNUP_MAX_RESENDS - int(record["resend_count"]), 0),
    )


@router.post("/api/signup/verify", response_model=AuthUserResponse, status_code=201)
async def signup_verify(payload: SignupVerifyRequest):
    email = _validate_email(payload.email)
    code = payload.code.strip()
    if not code:
        raise HTTPException(status_code=422, detail="Verification code is required")

    pending_signups, now, modified = _load_pending_signups_pruned()

    record = pending_signups.get(email)
    if not record:
        if modified:
            save_pending_signups(pending_signups)
        raise HTTPException(status_code=404, detail="No pending signup found for this email.")

    expires_at = _parse_iso(record.get("code_expires_at"))
    if not expires_at or expires_at <= now:
        del pending_signups[email]
        save_pending_signups(pending_signups)
        raise HTTPException(status_code=410, detail="Verification code expired. Please request a new code.")

    current_attempts = int(record.get("verify_attempts", 0))
    if current_attempts >= SIGNUP_MAX_VERIFY_ATTEMPTS:
        del pending_signups[email]
        save_pending_signups(pending_signups)
        raise HTTPException(status_code=429, detail="Too many verification attempts. Please restart signup.")

    code_hash = str(record.get("verification_code_hash", ""))
    if not verify_password(code, code_hash):
        record["verify_attempts"] = current_attempts + 1
        record["updated_at"] = _to_iso(now)
        if int(record["verify_attempts"]) >= SIGNUP_MAX_VERIFY_ATTEMPTS:
            del pending_signups[email]
            save_pending_signups(pending_signups)
            raise HTTPException(status_code=429, detail="Too many verification attempts. Please restart signup.")
        save_pending_signups(pending_signups)
        raise HTTPException(status_code=400, detail="Invalid verification code.")

    users = load_users()
    existing_username, _ = find_user_by_email(users, email)
    if existing_username:
        del pending_signups[email]
        save_pending_signups(pending_signups)
        raise HTTPException(status_code=409, detail="Email already in use")

    username, user_data = create_account_user(
        users,
        str(record.get("name", "")).strip(),
        email,
        record.get("phone"),
        str(record.get("password_hash", "")),
        password_is_hashed=True,
    )
    user_data["updated_at"] = _to_iso(now)
    users[username] = user_data
    save_users(users)

    del pending_signups[email]
    save_pending_signups(pending_signups)

    try:
        send_admin_signup_notification(
            verified_email=email,
            name=user_data.get("name", ""),
            username=username,
            timestamp=_to_iso(now),
        )
    except Exception:
        logger.exception("Failed to send admin signup notification", extra={"email": email})

    return AuthUserResponse(user=_safe_auth_user(user_data))


@router.post("/api/create-account", response_model=AuthUserResponse, status_code=201)
async def create_account(payload: CreateAccountRequest):
    name, email, phone = _validate_signup_payload(payload)

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
