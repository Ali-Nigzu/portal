"""Public contact, login and canonical session reads. Lifecycle routes are separate."""
from __future__ import annotations
import base64
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from backend.app.auth import clear_auth_cookie, get_canonical_user, get_session_user, set_auth_cookie
from backend.app.services import passwords
from backend.app.services.session_tokens import create_session
from backend.app.services.user_lifecycle import normalized_email
from backend.app.services.user_lifecycle_repository import LifecycleError
from backend.app.config import CONTACT_SUBMISSIONS_FILE, INTEREST_SUBMISSIONS_FILE
from backend.app.models import (AuthUser, AuthUserResponse, ContactResponse, IdentifierLoginRequest,
    EmailLoginRequest, LoginRequest, RegisterInterestRequest, RegisterInterestResponse)
from backend.app.services.postmark_email import (PostmarkConfigurationError, PostmarkDeliveryError,
    PostmarkAttachment, send_admin_contact_notification, send_contact_confirmation_email)
from .user_lifecycle import (
    router as lifecycle_router, LifecycleRoute, UNLOCK,
    challenge_handle, clear_lifecycle_cookie,
)
from .organisation_memberships import mutation_origin
router = APIRouter(route_class=LifecycleRoute)
router.include_router(lifecycle_router)
logger = logging.getLogger(__name__)
PHONE_RE = re.compile(r"^\+[1-9]\d{6,14}$")
CONTACT_MAX_FILES = 3
CONTACT_MAX_FILE_BYTES = 10 * 1024 * 1024
CONTACT_ALLOWED_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".csv", ".png", ".jpg", ".jpeg"}
CONTACT_ALLOWED_CONTENT_TYPES = {"application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv", "application/csv", "image/png", "image/jpeg"}

def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _to_iso(timestamp: datetime) -> str:
    return timestamp.astimezone(timezone.utc).isoformat()


def _validate_email(email: str) -> str:
    try:
        return normalized_email(email)
    except LifecycleError as error:
        raise HTTPException(error.status, error.message) from None


def _safe_auth_user(user_data: dict) -> AuthUser:
    return AuthUser(
        id=user_data["id"],
        name=user_data["name"],
        email=user_data["email"],
        phone=user_data.get("phone"),
    )


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


@router.post("/api/login", dependencies=[Depends(mutation_origin)])
def login(login_request: IdentifierLoginRequest | EmailLoginRequest | LoginRequest, response: Response, request: Request):
    """Authentication endpoint for user login."""
    try:
        identifier = getattr(login_request, "identifier", None) or getattr(
            login_request, "email", None
        ) or getattr(login_request, "username", "")
        identifier = identifier.strip()
        user = request.app.state.auth_repository.find_user(identifier)
        valid = user is not None and user.status == 1 and user.id != 999999 and passwords.verify_password(login_request.password, user.password_hash)
        if not valid:
            raise HTTPException(status_code=401, detail="Invalid identifier or password")
        session_token, expires_at = create_session(user.id, session_version=user.session_version)
        set_auth_cookie(response, session_token, expires_at)
        return AuthUserResponse(user=AuthUser(
            id=str(user.id), name=user.username, email=user.email,
            phone=user.phone_number,
        ))

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Login storage unavailable")
        raise HTTPException(status_code=500, detail="Internal server error") from exc


@router.get("/api/me", response_model=AuthUserResponse)
async def me(session_user: tuple[str, dict] = Depends(get_session_user)):
    _, user_data = session_user
    return AuthUserResponse(user=_safe_auth_user(user_data))


@router.post("/api/logout", status_code=204, dependencies=[Depends(mutation_origin)])
def logout(request: Request, response: Response):
    lifecycle = getattr(request.app.state, 'user_lifecycle', None)
    if lifecycle is not None:
        try:
            user = get_canonical_user(request, request.cookies.get('camos_session'))
            lifecycle.end_unlock(user, challenge_handle(request, UNLOCK))
        except HTTPException:
            pass  # Logout remains available with an already expired session.
        except Exception:
            logger.warning('account.logout_unlock_cleanup_deferred')
        lifecycle.cleanup_expired()
    clear_lifecycle_cookie(response, UNLOCK)
    clear_auth_cookie(response)
