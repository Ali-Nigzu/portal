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
from backend.app.config import CONTACT_SUBMISSIONS_FILE, INTEREST_SUBMISSIONS_FILE
from backend.app.data.json_store import (
    create_account_user,
    find_user_by_email,
    hash_password,
    load_pending_settings_unlocks,
    load_pending_signups,
    load_users,
    normalize_email,
    save_pending_settings_unlocks,
    save_pending_signups,
    save_pending_password_resets,
    load_pending_password_resets,
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
    SettingsUnlockResendResponse,
    SettingsUnlockStartRequest,
    SettingsUnlockStartResponse,
    SettingsUnlockVerifyRequest,
    SettingsUnlockVerifyResponse,
    UpdateMeRequest,
    RegisterInterestRequest,
    RegisterInterestResponse,
    PasswordResetStartRequest,
    PasswordResetStartResponse,
    PasswordResetResendRequest,
    PasswordResetResendResponse,
    PasswordResetVerifyRequest,
    PasswordResetVerifyResponse,
    PasswordResetSetPasswordRequest,
    PasswordResetSetPasswordResponse,
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
    send_settings_unlock_code_email,
    send_password_reset_code_email,
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
PASSWORD_RESET_CODE_TTL_SECONDS = 15 * 60
PASSWORD_RESET_MAX_VERIFY_ATTEMPTS = 5
PASSWORD_RESET_RESEND_COOLDOWN_SECONDS = 30
PASSWORD_RESET_MAX_RESENDS = 5
PASSWORD_RESET_SESSION_TTL_SECONDS = 10 * 60

SETTINGS_UNLOCK_CODE_TTL_SECONDS = 15 * 60
SETTINGS_UNLOCK_MAX_VERIFY_ATTEMPTS = 5
SETTINGS_UNLOCK_RESEND_COOLDOWN_SECONDS = 30
SETTINGS_UNLOCK_MAX_RESENDS = 5
SETTINGS_UNLOCK_SESSION_SECONDS = 5 * 60

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


def _prune_expired_password_resets(password_resets: dict, now: datetime) -> bool:
    to_delete: list[str] = []
    for email, record in password_resets.items():
        expires_at = _parse_iso(record.get("code_expires_at"))
        if expires_at is None or expires_at <= now:
            to_delete.append(email)
    for email in to_delete:
        del password_resets[email]
    return bool(to_delete)


def _load_password_resets_pruned() -> tuple[dict, datetime, bool]:
    password_resets = load_pending_password_resets()
    now = _utc_now()
    modified = _prune_expired_password_resets(password_resets, now)
    return password_resets, now, modified


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
        raise HTTPException(status_code=502, detail="Failed to send signup email.") from exc
    logger.exception("signup.email.unknown_error request_id=%s", request_id)
    raise HTTPException(status_code=502, detail="Failed to send signup email.") from exc


def _raise_password_reset_mail_delivery_error(exc: Exception, *, request_id: str) -> None:
    if isinstance(exc, PostmarkConfigurationError):
        logger.error(
            "password_reset.email.config_error request_id=%s has_server_token=%s has_from_email=%s detail=%s",
            request_id,
            bool(os.getenv("POSTMARK_SERVER_TOKEN", "").strip()),
            bool(os.getenv("POSTMARK_FROM_EMAIL", "").strip()),
            str(exc),
        )
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if isinstance(exc, PostmarkDeliveryError):
        logger.error(
            "password_reset.email.delivery_error request_id=%s status_code=%s error_code=%s message=%s",
            request_id,
            exc.status_code,
            exc.error_code,
            exc.error_message,
        )
        raise HTTPException(status_code=502, detail="Failed to send reset code email.") from exc
    logger.exception("password_reset.email.unknown_error request_id=%s", request_id)
    raise HTTPException(status_code=502, detail="Failed to send reset code email.") from exc


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


def _append_contact_submission_record(record: dict) -> None:
    os.makedirs(os.path.dirname(CONTACT_SUBMISSIONS_FILE), exist_ok=True)
    if os.path.exists(CONTACT_SUBMISSIONS_FILE):
        with open(CONTACT_SUBMISSIONS_FILE, "r") as f:
            try:
                submissions = json.load(f)
            except json.JSONDecodeError:
                submissions = []
    else:
        submissions = []

    if not isinstance(submissions, list):
        submissions = []

    submissions.append(record)
    tmp_path = f"{CONTACT_SUBMISSIONS_FILE}.tmp"
    with open(tmp_path, "w") as f:
        json.dump(submissions, f, indent=2)
    os.replace(tmp_path, CONTACT_SUBMISSIONS_FILE)


def _validate_contact_upload(content_type: str | None, filename: str, payload: bytes) -> None:
    extension = os.path.splitext(filename)[1].lower()
    normalized_type = (content_type or "").lower().strip()

    if extension not in CONTACT_ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=422, detail=f"Unsupported file type: {filename}")

    if normalized_type and normalized_type not in CONTACT_ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=422, detail=f"Unsupported file type: {filename}")

    if len(payload) > CONTACT_MAX_FILE_BYTES:
        raise HTTPException(status_code=422, detail=f"File exceeds 10MB limit: {filename}")


def _settings_unlock_challenge_key(user_id: str) -> str:
    return user_id


def _raise_settings_unlock_mail_delivery_error(exc: Exception, *, request_id: str) -> None:
    if isinstance(exc, PostmarkConfigurationError):
        logger.error(
            "settings.unlock.email.config_error request_id=%s has_server_token=%s has_from_email=%s has_admin_notify_email=%s detail=%s",
            request_id,
            bool(os.getenv("POSTMARK_SERVER_TOKEN", "").strip()),
            bool(os.getenv("POSTMARK_FROM_EMAIL", "").strip()),
            bool(os.getenv("ADMIN_NOTIFY_EMAIL", "").strip()),
            str(exc),
        )
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if isinstance(exc, PostmarkDeliveryError):
        logger.error(
            "settings.unlock.email.delivery_error request_id=%s status_code=%s error_code=%s message=%s",
            request_id,
            exc.status_code,
            exc.error_code,
            exc.error_message,
        )
        raise HTTPException(status_code=502, detail="Failed to send unlock code.") from exc
    logger.exception("settings.unlock.email.unknown_error request_id=%s", request_id)
    raise HTTPException(status_code=502, detail="Failed to send unlock code.") from exc


def _prune_expired_settings_unlocks(challenges: dict, now: datetime) -> bool:
    to_delete: list[str] = []
    for key, record in challenges.items():
        expires_at = _parse_iso(record.get("code_expires_at"))
        unlock_expires_at = _parse_iso(record.get("unlock_expires_at"))
        is_verified = bool(record.get("is_verified"))
        if (not expires_at or expires_at <= now) and (not is_verified or not unlock_expires_at or unlock_expires_at <= now):
            to_delete.append(key)
        elif is_verified and (not unlock_expires_at or unlock_expires_at <= now):
            to_delete.append(key)
    for key in to_delete:
        del challenges[key]
    return bool(to_delete)


def _load_settings_unlocks_pruned() -> tuple[dict, datetime, bool]:
    challenges = load_pending_settings_unlocks()
    now = _utc_now()
    modified = _prune_expired_settings_unlocks(challenges, now)
    return challenges, now, modified


def _validate_update_me_payload(payload: UpdateMeRequest) -> tuple[str | None, str | None, str | None]:
    name = payload.name.strip() if isinstance(payload.name, str) else None
    if name is not None and not name:
        raise HTTPException(status_code=422, detail="Name is required")

    phone = payload.phone.strip() if isinstance(payload.phone, str) else None
    if phone is not None and phone and not PHONE_RE.match(phone):
        raise HTTPException(status_code=422, detail="Not a valid phone number")

    password = payload.password.strip() if isinstance(payload.password, str) else None
    confirm_password = payload.confirm_password.strip() if isinstance(payload.confirm_password, str) else None

    if (password and not confirm_password) or (confirm_password and not password):
        raise HTTPException(status_code=422, detail="Password and confirm password are required")

    if password:
        if len(password) < 8:
            raise HTTPException(status_code=422, detail="Password must be at least 8 characters")
        if password != confirm_password:
            raise HTTPException(status_code=422, detail="Passwords do not match")

    return name, phone, password


@router.post("/api/settings/unlock/start", response_model=SettingsUnlockStartResponse)
async def settings_unlock_start(
    payload: SettingsUnlockStartRequest,
    session_user: tuple[str, dict] = Depends(get_session_user),
):
    request_id = str(uuid.uuid4())
    username, user_data = session_user
    current_password = payload.current_password
    if not current_password:
        raise HTTPException(status_code=422, detail="Current password is required")

    stored_hash = user_data.get("password_hash") or user_data.get("password", "")
    if not verify_password(current_password, stored_hash):
        raise HTTPException(status_code=401, detail="Incorrect password")

    email = _validate_email(str(user_data.get("email", "")))
    challenge_key = _settings_unlock_challenge_key(str(user_data.get("id", username)))
    challenges, now, _ = _load_settings_unlocks_pruned()

    code = _generate_verification_code()
    now_iso = _to_iso(now)
    code_expires_at_iso = _to_iso(now + timedelta(seconds=SETTINGS_UNLOCK_CODE_TTL_SECONDS))

    challenges[challenge_key] = {
        "user_id": str(user_data.get("id", username)),
        "username": username,
        "email": email,
        "verification_code_hash": hash_password(code),
        "code_expires_at": code_expires_at_iso,
        "verify_attempts": 0,
        "resend_count": 0,
        "last_code_sent_at": now_iso,
        "is_verified": False,
        "unlock_token": None,
        "unlock_expires_at": None,
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    try:
        send_settings_unlock_code_email(to_email=email, code=code)
    except Exception as exc:
        _raise_settings_unlock_mail_delivery_error(exc, request_id=request_id)

    save_pending_settings_unlocks(challenges)
    return SettingsUnlockStartResponse(
        ok=True,
        expiresInSeconds=SETTINGS_UNLOCK_CODE_TTL_SECONDS,
        resendCooldownSeconds=SETTINGS_UNLOCK_RESEND_COOLDOWN_SECONDS,
    )


@router.post("/api/settings/unlock/resend", response_model=SettingsUnlockResendResponse)
async def settings_unlock_resend(session_user: tuple[str, dict] = Depends(get_session_user)):
    request_id = str(uuid.uuid4())
    username, user_data = session_user
    challenge_key = _settings_unlock_challenge_key(str(user_data.get("id", username)))

    challenges, now, modified = _load_settings_unlocks_pruned()
    record = challenges.get(challenge_key)
    if not record:
        if modified:
            save_pending_settings_unlocks(challenges)
        raise HTTPException(status_code=404, detail="No unlock challenge found.")

    expires_at = _parse_iso(record.get("code_expires_at"))
    if not expires_at or expires_at <= now:
        del challenges[challenge_key]
        save_pending_settings_unlocks(challenges)
        raise HTTPException(status_code=410, detail="Unlock code expired. Restart unlock.")

    last_sent_at = _parse_iso(record.get("last_code_sent_at"))
    if last_sent_at and (now - last_sent_at).total_seconds() < SETTINGS_UNLOCK_RESEND_COOLDOWN_SECONDS:
        raise HTTPException(status_code=429, detail="Please wait before requesting another code.")

    resend_count = int(record.get("resend_count", 0))
    if resend_count >= SETTINGS_UNLOCK_MAX_RESENDS:
        raise HTTPException(status_code=429, detail="Maximum resend attempts reached.")

    code = _generate_verification_code()
    now_iso = _to_iso(now)
    record["verification_code_hash"] = hash_password(code)
    record["code_expires_at"] = _to_iso(now + timedelta(seconds=SETTINGS_UNLOCK_CODE_TTL_SECONDS))
    record["resend_count"] = resend_count + 1
    record["last_code_sent_at"] = now_iso
    record["updated_at"] = now_iso

    try:
        send_settings_unlock_code_email(to_email=record["email"], code=code)
    except Exception as exc:
        _raise_settings_unlock_mail_delivery_error(exc, request_id=request_id)

    save_pending_settings_unlocks(challenges)
    return SettingsUnlockResendResponse(
        ok=True,
        expiresInSeconds=SETTINGS_UNLOCK_CODE_TTL_SECONDS,
        resendCooldownSeconds=SETTINGS_UNLOCK_RESEND_COOLDOWN_SECONDS,
        resendsRemaining=max(SETTINGS_UNLOCK_MAX_RESENDS - int(record["resend_count"]), 0),
    )


@router.post("/api/settings/unlock/verify", response_model=SettingsUnlockVerifyResponse)
async def settings_unlock_verify(
    payload: SettingsUnlockVerifyRequest,
    session_user: tuple[str, dict] = Depends(get_session_user),
):
    username, user_data = session_user
    challenge_key = _settings_unlock_challenge_key(str(user_data.get("id", username)))
    code = payload.code.strip()
    if not code:
        raise HTTPException(status_code=422, detail="Verification code is required")

    challenges, now, modified = _load_settings_unlocks_pruned()
    record = challenges.get(challenge_key)
    if not record:
        if modified:
            save_pending_settings_unlocks(challenges)
        raise HTTPException(status_code=404, detail="No unlock challenge found.")

    expires_at = _parse_iso(record.get("code_expires_at"))
    if not expires_at or expires_at <= now:
        del challenges[challenge_key]
        save_pending_settings_unlocks(challenges)
        raise HTTPException(status_code=410, detail="Unlock code expired. Restart unlock.")

    current_attempts = int(record.get("verify_attempts", 0))
    if current_attempts >= SETTINGS_UNLOCK_MAX_VERIFY_ATTEMPTS:
        del challenges[challenge_key]
        save_pending_settings_unlocks(challenges)
        raise HTTPException(status_code=429, detail="Too many verification attempts. Restart unlock.")

    code_hash = str(record.get("verification_code_hash", ""))
    if not verify_password(code, code_hash):
        record["verify_attempts"] = current_attempts + 1
        record["updated_at"] = _to_iso(now)
        if int(record["verify_attempts"]) >= SETTINGS_UNLOCK_MAX_VERIFY_ATTEMPTS:
            del challenges[challenge_key]
            save_pending_settings_unlocks(challenges)
            raise HTTPException(status_code=429, detail="Too many verification attempts. Restart unlock.")
        save_pending_settings_unlocks(challenges)
        raise HTTPException(status_code=400, detail="Invalid verification code.")

    unlock_token = secrets.token_urlsafe(24)
    record["is_verified"] = True
    record["unlock_token"] = hash_session_token(unlock_token)
    record["unlock_expires_at"] = _to_iso(now + timedelta(seconds=SETTINGS_UNLOCK_SESSION_SECONDS))
    record["updated_at"] = _to_iso(now)
    save_pending_settings_unlocks(challenges)

    return SettingsUnlockVerifyResponse(
        ok=True,
        unlockToken=unlock_token,
        unlockExpiresInSeconds=SETTINGS_UNLOCK_SESSION_SECONDS,
    )


@router.put("/api/me", response_model=AuthUserResponse)
async def update_me(
    payload: UpdateMeRequest,
    session_user: tuple[str, dict] = Depends(get_session_user),
):
    username, user_data = session_user
    challenge_key = _settings_unlock_challenge_key(str(user_data.get("id", username)))
    unlock_token = payload.unlock_token.strip()
    if not unlock_token:
        raise HTTPException(status_code=401, detail="Unlock required")

    challenges, now, modified = _load_settings_unlocks_pruned()
    record = challenges.get(challenge_key)
    if not record:
        if modified:
            save_pending_settings_unlocks(challenges)
        raise HTTPException(status_code=401, detail="Unlock required")

    unlock_expires_at = _parse_iso(record.get("unlock_expires_at"))
    stored_unlock_token_hash = str(record.get("unlock_token", ""))
    if not record.get("is_verified") or not unlock_expires_at or unlock_expires_at <= now or not secrets.compare_digest(hash_session_token(unlock_token), stored_unlock_token_hash):
        del challenges[challenge_key]
        save_pending_settings_unlocks(challenges)
        raise HTTPException(status_code=401, detail="Unlock expired. Please unlock again.")

    name, phone, password = _validate_update_me_payload(payload)

    users = load_users()
    existing = users.get(username)
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")

    if name is not None:
        existing["name"] = name
    if phone is not None:
        existing["phone"] = phone or None
    if password:
        password_hash = hash_password(password)
        existing["password_hash"] = password_hash
        existing["password"] = password_hash

    existing["updated_at"] = _to_iso(now)
    users[username] = existing
    save_users(users)

    record["updated_at"] = _to_iso(now)
    challenges[challenge_key] = record
    save_pending_settings_unlocks(challenges)

    return AuthUserResponse(user=_safe_auth_user(existing))


@router.post("/api/contact", response_model=ContactResponse)
async def submit_contact(
    name: str = Form(...),
    email: str = Form(...),
    phone: str | None = Form(default=None),
    company: str | None = Form(default=None),
    message: str = Form(...),
    page_url: str | None = Form(default=None),
    attachments: list[UploadFile] = File(default=[]),
):
    request_id = str(uuid.uuid4())
    safe_name, safe_email, safe_phone, safe_message = _validate_contact_fields(name, email, phone, message)
    safe_company = company.strip() if company and company.strip() else None
    safe_page_url = page_url.strip() if page_url and page_url.strip() else None

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

    submitted_at = _to_iso(_utc_now())
    submission_record = {
        "id": request_id,
        "submitted_at": submitted_at,
        "name": safe_name,
        "email": safe_email,
        "phone": safe_phone,
        "company": safe_company,
        "message": safe_message,
        "page_url": safe_page_url,
        "attachments": attachment_names,
    }
    try:
        _append_contact_submission_record(submission_record)
    except Exception as exc:
        logger.exception("contact.submission.persist_failed request_id=%s", request_id)
        raise HTTPException(status_code=500, detail="Failed to save contact message.") from exc

    logger.info(
        "contact.email.trigger_start request_id=%s contact_email=%s attachment_count=%s",
        request_id,
        safe_email,
        len(attachment_names),
    )
    try:
        admin_result = send_admin_contact_notification(
            name=safe_name,
            email=safe_email,
            phone=safe_phone,
            company=safe_company,
            message=safe_message,
            submitted_at=submitted_at,
            page_url=safe_page_url,
            attachment_names=attachment_names,
            attachments=postmark_attachments,
        )
        confirmation_result = send_contact_confirmation_email(to_email=safe_email, name=safe_name, message=safe_message)
    except Exception as exc:
        _raise_contact_mail_delivery_error(exc, request_id=request_id)

    logger.info(
        "contact.email.sent request_id=%s admin_message_id=%s confirmation_message_id=%s",
        request_id,
        admin_result.message_id,
        confirmation_result.message_id,
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

    logger.info("signup.email.verification_trigger_start request_id=%s email=%s", request_id, email)
    try:
        verification_result = send_verification_email(to_email=email, code=code)
    except Exception as exc:
        _raise_mail_delivery_error(exc, request_id=request_id)

    logger.info(
        "signup.email.verification_sent request_id=%s email=%s message_id=%s",
        request_id,
        email,
        verification_result.message_id,
    )

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

    logger.info("signup.email.verification_resend_trigger_start request_id=%s email=%s", request_id, email)
    try:
        verification_result = send_verification_email(to_email=email, code=code)
    except Exception as exc:
        _raise_mail_delivery_error(exc, request_id=request_id)

    logger.info(
        "signup.email.verification_resent request_id=%s email=%s message_id=%s",
        request_id,
        email,
        verification_result.message_id,
    )

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

    request_id = str(uuid.uuid4())
    logger.info(
        "signup.email.admin_notification_trigger_start request_id=%s user_id=%s email=%s",
        request_id,
        user_data.get("id"),
        email,
    )
    try:
        signup_notification_result = send_admin_signup_notification(
            verified_email=email,
            name=user_data.get("name", ""),
            username=username,
            timestamp=_to_iso(now),
            phone=user_data.get("phone"),
        )
    except Exception as exc:
        _raise_mail_delivery_error(exc, request_id=request_id)

    logger.info(
        "signup.email.admin_notification_sent request_id=%s user_id=%s message_id=%s",
        request_id,
        user_data.get("id"),
        signup_notification_result.message_id,
    )

    save_users(users)
    del pending_signups[email]
    save_pending_signups(pending_signups)

    return AuthUserResponse(user=_safe_auth_user(user_data))


@router.post("/api/password-reset/start", response_model=PasswordResetStartResponse, status_code=202)
async def password_reset_start(payload: PasswordResetStartRequest):
    request_id = str(uuid.uuid4())
    email = _validate_email(payload.email)
    users = load_users()
    username, _ = find_user_by_email(users, email)
    if not username:
        return PasswordResetStartResponse(ok=True, email=email, expiresInSeconds=PASSWORD_RESET_CODE_TTL_SECONDS, resendCooldownSeconds=PASSWORD_RESET_RESEND_COOLDOWN_SECONDS)

    password_resets, now, _ = _load_password_resets_pruned()
    now_iso = _to_iso(now)
    code = _generate_verification_code()
    password_resets[email] = {
        "email": email,
        "verification_code_hash": hash_password(code),
        "code_expires_at": _to_iso(now + timedelta(seconds=PASSWORD_RESET_CODE_TTL_SECONDS)),
        "verify_attempts": 0,
        "resend_count": 0,
        "last_code_sent_at": now_iso,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    try:
        send_password_reset_code_email(to_email=email, code=code)
    except Exception as exc:
        _raise_password_reset_mail_delivery_error(exc, request_id=request_id)
    save_pending_password_resets(password_resets)
    return PasswordResetStartResponse(ok=True, email=email, expiresInSeconds=PASSWORD_RESET_CODE_TTL_SECONDS, resendCooldownSeconds=PASSWORD_RESET_RESEND_COOLDOWN_SECONDS)


@router.post("/api/password-reset/resend", response_model=PasswordResetResendResponse)
async def password_reset_resend(payload: PasswordResetResendRequest):
    request_id = str(uuid.uuid4())
    email = _validate_email(payload.email)
    password_resets, now, modified = _load_password_resets_pruned()
    record = password_resets.get(email)
    if not record:
        if modified:
            save_pending_password_resets(password_resets)
        raise HTTPException(status_code=404, detail="No pending password reset found for this email.")

    last_sent_at = _parse_iso(record.get("last_code_sent_at"))
    if last_sent_at and (now - last_sent_at).total_seconds() < PASSWORD_RESET_RESEND_COOLDOWN_SECONDS:
        if modified:
            save_pending_password_resets(password_resets)
        raise HTTPException(status_code=429, detail="Please wait before requesting another code.")

    resend_count = int(record.get("resend_count", 0))
    if resend_count >= PASSWORD_RESET_MAX_RESENDS:
        if modified:
            save_pending_password_resets(password_resets)
        raise HTTPException(status_code=429, detail="Resend limit reached. Please restart password reset.")

    code = _generate_verification_code()
    record["verification_code_hash"] = hash_password(code)
    record["code_expires_at"] = _to_iso(now + timedelta(seconds=PASSWORD_RESET_CODE_TTL_SECONDS))
    record["resend_count"] = resend_count + 1
    record["last_code_sent_at"] = _to_iso(now)
    record["verify_attempts"] = 0
    record["updated_at"] = _to_iso(now)
    try:
        send_password_reset_code_email(to_email=email, code=code)
    except Exception as exc:
        _raise_password_reset_mail_delivery_error(exc, request_id=request_id)
    save_pending_password_resets(password_resets)
    return PasswordResetResendResponse(ok=True, expiresInSeconds=PASSWORD_RESET_CODE_TTL_SECONDS, resendCooldownSeconds=PASSWORD_RESET_RESEND_COOLDOWN_SECONDS, resendsRemaining=max(PASSWORD_RESET_MAX_RESENDS - int(record["resend_count"]), 0))


@router.post("/api/password-reset/verify-code", response_model=PasswordResetVerifyResponse)
async def password_reset_verify(payload: PasswordResetVerifyRequest):
    email = _validate_email(payload.email)
    code = payload.code.strip()
    if not code:
        raise HTTPException(status_code=422, detail="Verification code is required")
    password_resets, now, modified = _load_password_resets_pruned()
    record = password_resets.get(email)
    if not record:
        if modified:
            save_pending_password_resets(password_resets)
        raise HTTPException(status_code=404, detail="No pending password reset found for this email.")

    attempts = int(record.get("verify_attempts", 0))
    if attempts >= PASSWORD_RESET_MAX_VERIFY_ATTEMPTS:
        del password_resets[email]
        save_pending_password_resets(password_resets)
        raise HTTPException(status_code=429, detail="Too many verification attempts. Please restart password reset.")

    if not verify_password(code, str(record.get("verification_code_hash", ""))):
        record["verify_attempts"] = attempts + 1
        record["updated_at"] = _to_iso(now)
        if int(record["verify_attempts"]) >= PASSWORD_RESET_MAX_VERIFY_ATTEMPTS:
            del password_resets[email]
            save_pending_password_resets(password_resets)
            raise HTTPException(status_code=429, detail="Too many verification attempts. Please restart password reset.")
        save_pending_password_resets(password_resets)
        raise HTTPException(status_code=400, detail="Invalid verification code.")

    reset_token = secrets.token_urlsafe(24)
    record["reset_token_hash"] = hash_session_token(reset_token)
    record["reset_expires_at"] = _to_iso(now + timedelta(seconds=PASSWORD_RESET_SESSION_TTL_SECONDS))
    record["updated_at"] = _to_iso(now)
    save_pending_password_resets(password_resets)
    return PasswordResetVerifyResponse(ok=True, resetToken=reset_token, resetExpiresInSeconds=PASSWORD_RESET_SESSION_TTL_SECONDS)


@router.post("/api/password-reset/set-password", response_model=PasswordResetSetPasswordResponse)
async def password_reset_set_password(payload: PasswordResetSetPasswordRequest):
    email = _validate_email(payload.email)
    reset_token = payload.reset_token.strip()
    if not reset_token:
        raise HTTPException(status_code=422, detail="Reset token is required")
    if not payload.password:
        raise HTTPException(status_code=422, detail="Password is required")
    if len(payload.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")
    if payload.password != payload.confirm_password:
        raise HTTPException(status_code=422, detail="Passwords do not match")

    password_resets, now, modified = _load_password_resets_pruned()
    record = password_resets.get(email)
    if not record:
        if modified:
            save_pending_password_resets(password_resets)
        raise HTTPException(status_code=404, detail="No pending password reset found for this email.")

    reset_expires_at = _parse_iso(record.get("reset_expires_at"))
    if not reset_expires_at or reset_expires_at <= now:
        del password_resets[email]
        save_pending_password_resets(password_resets)
        raise HTTPException(status_code=410, detail="Reset session expired. Restart password reset.")

    if hash_session_token(reset_token) != str(record.get("reset_token_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid reset session. Restart password reset.")

    users = load_users()
    username, user_data = find_user_by_email(users, email)
    if username and user_data:
        password_hash = hash_password(payload.password)
        users[username]["password_hash"] = password_hash
        users[username]["password"] = password_hash
        users[username]["updated_at"] = _to_iso(now)
        save_users(users)

    del password_resets[email]
    save_pending_password_resets(password_resets)
    return PasswordResetSetPasswordResponse(ok=True)


@router.post("/api/password-reset/verify", response_model=PasswordResetSetPasswordResponse)
async def password_reset_verify_legacy(payload: PasswordResetSetPasswordRequest):
    """Backward compatible endpoint for older clients."""
    return await password_reset_set_password(payload)


@router.post("/api/create-account", response_model=AuthUserResponse, status_code=201)
async def create_account(payload: CreateAccountRequest):
    request_id = str(uuid.uuid4())
    name, email, phone = _validate_signup_payload(payload)

    users = load_users()
    existing_username, _ = find_user_by_email(users, email)
    if existing_username:
        raise HTTPException(status_code=409, detail="Email already in use")

    username, user_data = create_account_user(users, name, email, phone, payload.password)
    user_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    logger.info(
        "signup.email.admin_notification_trigger_start request_id=%s user_id=%s email=%s source=legacy_create_account",
        request_id,
        user_data.get("id"),
        email,
    )
    try:
        signup_notification_result = send_admin_signup_notification(
            verified_email=email,
            name=user_data.get("name", ""),
            username=username,
            timestamp=user_data["updated_at"],
            phone=user_data.get("phone"),
            source="Legacy create-account endpoint",
        )
    except Exception as exc:
        _raise_mail_delivery_error(exc, request_id=request_id)

    logger.info(
        "signup.email.admin_notification_sent request_id=%s user_id=%s message_id=%s source=legacy_create_account",
        request_id,
        user_data.get("id"),
        signup_notification_result.message_id,
    )

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
