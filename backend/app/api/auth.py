"""Public contact, login and canonical session reads. Lifecycle routes are separate."""
from __future__ import annotations
import base64
import fcntl
import json
import tempfile
from threading import Lock
import ijson
import logging
import os
import re
from datetime import datetime, timezone
from starlette.concurrency import run_in_threadpool
from backend.app.middleware import request_id as current_request_id
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from backend.app.auth import clear_auth_cookie, get_canonical_user, get_session_user, set_auth_cookie
from backend.app.services import passwords
from backend.app.services.session_tokens import create_session
from backend.app.services.user_lifecycle import normalized_email
from backend.app.services.user_lifecycle_repository import LifecycleError
from backend.app.config import CONTACT_SUBMISSIONS_FILE
from backend.app.models import AuthUser, AuthUserResponse, ContactResponse, EmailLoginRequest
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

ATTACHMENT_ENVELOPE_BYTES = 8_000_000  # Leaves 2 MB for bodies, MIME and metadata.
ATTACHMENT_OVERHEAD_BYTES = 1024
CONTACT_ENVELOPE_MESSAGE = 'Attachments are too large to send together. Please use smaller files.'


def encoded_attachment_bytes(size, filename, content_type):
    return 4 * ((size + 2) // 3) + len(filename.encode()) + len(content_type.encode()) + ATTACHMENT_OVERHEAD_BYTES

_contact_journal_lock = Lock()
_CONTACT_JOURNAL_CHUNK = 64 * 1024


def _last_content(source, before):
    while before:
        start = max(0, before - _CONTACT_JOURNAL_CHUNK)
        source.seek(start)
        block = source.read(before - start).rstrip(b' \t\r\n')
        if block:
            return start + len(block)
        before = start
    return 0


def _append_contact_journal(path, record):
    directory = os.path.dirname(path) or '.'
    os.makedirs(directory, exist_ok=True)
    with _contact_journal_lock, open(path + '.lock', 'a') as lock_file:
        fcntl.flock(lock_file, fcntl.LOCK_EX)
        temporary = None
        try:
            has_items = False
            prefix_end = None
            if os.path.exists(path):
                with open(path, 'rb') as source:
                    events = ijson.parse(source)
                    if next(events, None) != ('', 'start_array', None):
                        raise ValueError('Contact journal must be a JSON array')
                    last = None
                    for prefix, event, value in events:
                        has_items |= prefix == 'item'
                        last = (prefix, event)
                    if last != ('', 'end_array'):
                        raise ValueError('Incomplete Contact journal')
                    end = _last_content(source, os.fstat(source.fileno()).st_size)
                    prefix_end = _last_content(source, end - 1)
            descriptor, temporary = tempfile.mkstemp(prefix='.contact-', dir=directory)
            with os.fdopen(descriptor, 'wb') as target:
                if prefix_end is None:
                    target.write(b'[')
                else:
                    with open(path, 'rb') as source:
                        remaining = prefix_end
                        while remaining:
                            block = source.read(min(_CONTACT_JOURNAL_CHUNK, remaining))
                            if not block:
                                raise OSError('Contact journal changed during append')
                            target.write(block)
                            remaining -= len(block)
                target.write(b',\n' if has_items else b'\n')
                encoded = ('  ' + json.dumps(record, indent=2, allow_nan=False).replace('\n', '\n  ')).encode()
                target.write(encoded + b'\n]')
                target.flush()
                os.fsync(target.fileno())
            os.replace(temporary, path)
            temporary = None
        finally:
            if temporary is not None:
                os.unlink(temporary)
            fcntl.flock(lock_file, fcntl.LOCK_UN)

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
        has_password=user_data["has_password"],
    )


def _raise_contact_mail_delivery_error(exc: Exception, *, request_id: str) -> None:
    if isinstance(exc, PostmarkConfigurationError):
        logger.error(
            "contact.email.config_error request_id=%s has_server_token=%s has_from_email=%s has_admin_notify_email=%s",
            request_id,
            bool(os.getenv("POSTMARK_SERVER_TOKEN", "").strip()),
            bool(os.getenv("POSTMARK_FROM_EMAIL", "").strip()),
            bool(os.getenv("ADMIN_NOTIFY_EMAIL", "").strip()),
        )
        raise HTTPException(503, "Couldn't send message. Try again.", headers={'X-camos-action-outcome': 'not_sent'}) from None
    if isinstance(exc, PostmarkDeliveryError):
        logger.error("contact.email.delivery_error request_id=%s provider=postmark status=%s category=%s",
                     request_id, exc.status_code, exc.error_code)
        if not exc.uncertain:
            raise HTTPException(502, "Couldn't send message. Try again.", headers={'X-camos-action-outcome': 'not_sent'}) from None
    logger.error("contact.email.unknown_outcome request_id=%s category=%s", request_id, type(exc).__name__)
    raise HTTPException(502, 'Please check before trying again.', headers={'X-camos-action-outcome': 'unknown'}) from None


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
    _append_contact_journal(CONTACT_SUBMISSIONS_FILE, record)


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
    request_id = current_request_id()
    safe_name, safe_email, safe_phone, safe_message = _validate_contact_fields(name, email, phone, message)
    safe_company = company.strip() if company and company.strip() else None
    safe_page_url = page_url.strip() if page_url and page_url.strip() else None

    for value, maximum in ((safe_name, 1024), (safe_message, 65536), (safe_company or '', 4096), (safe_page_url or '', 4096)):
        if len(value.encode()) > maximum:
            raise HTTPException(422, 'Contact details are too long.')
    if len(attachments) > CONTACT_MAX_FILES:
        raise HTTPException(status_code=422, detail="Upload up to 3 attachments.")

    postmark_attachments: list[PostmarkAttachment] = []
    attachment_names: list[str] = []

    envelope = 0
    for attachment in attachments:
        filename = (attachment.filename or "attachment").strip()
        content_type = attachment.content_type or "application/octet-stream"
        if len(filename.encode()) > 1024 or len(content_type.encode()) > 256:
            raise HTTPException(422, 'Attachment metadata is too long.')
        if attachment.size is not None and attachment.size > CONTACT_MAX_FILE_BYTES:
            raise HTTPException(422, f"File exceeds 10MB limit: {filename}")
        remaining = max(0, (ATTACHMENT_ENVELOPE_BYTES - envelope - encoded_attachment_bytes(0, filename, content_type)) // 4 * 3)
        payload = await attachment.read(min(CONTACT_MAX_FILE_BYTES, remaining) + 1)
        _validate_contact_upload(attachment.content_type, filename, payload)

        envelope += encoded_attachment_bytes(len(payload), filename, content_type)
        if envelope > ATTACHMENT_ENVELOPE_BYTES:
            raise HTTPException(422, CONTACT_ENVELOPE_MESSAGE)
        postmark_attachments.append(
            PostmarkAttachment(
                name=filename,
                content_type=attachment.content_type or "application/octet-stream",
                content_base64=await run_in_threadpool(lambda data: base64.b64encode(data).decode("ascii"), payload),
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
    def persist_and_deliver():
        try:
            _append_contact_submission_record(submission_record)
        except Exception as exc:
            logger.error("contact.submission.persist_failed request_id=%s category=%s", request_id, type(exc).__name__)
            raise HTTPException(500, "Couldn't send message. Try again.", headers={'X-camos-action-outcome': 'not_sent'}) from None
        logger.info("contact.email.trigger_start request_id=%s attachment_count=%s", request_id, len(attachment_names))
        try:
            admin_result = send_admin_contact_notification(
                name=safe_name, email=safe_email, phone=safe_phone, company=safe_company,
                message=safe_message, submitted_at=submitted_at, page_url=safe_page_url,
                attachment_names=attachment_names, attachments=postmark_attachments,
            )
        except Exception as exc:
            _raise_contact_mail_delivery_error(exc, request_id=request_id)
        try:
            confirmation_result = send_contact_confirmation_email(to_email=safe_email, name=safe_name, message=safe_message)
            logger.info('contact.receipt.sent request_id=%s message_id=%s', request_id, confirmation_result.message_id)
        except Exception as exc:
            logger.warning('contact.receipt.unavailable request_id=%s category=%s', request_id, type(exc).__name__)
        logger.info("contact.email.sent request_id=%s admin_message_id=%s", request_id, admin_result.message_id)
    await run_in_threadpool(persist_and_deliver)

    return ContactResponse(message="Message sent.")


@router.post("/api/login", dependencies=[Depends(mutation_origin)])
def login(login_request: EmailLoginRequest, response: Response, request: Request):
    """Authentication endpoint for user login."""
    try:
        if not request.app.state.auth_repository.password_attempt_allowed(login_request.email):
            raise HTTPException(429, 'Too many sign-in attempts. Please try again later.')
        user = request.app.state.auth_repository.find_email(login_request.email.strip())
        if user is not None and user.status == 1 and user.id != 999999 and user.password_hash is None:
            from .provider_auth import provider_required
            return provider_required(request, user)
        valid = user is not None and user.status == 1 and user.id != 999999 and passwords.verify_password(login_request.password, user.password_hash)
        if not valid:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        session_token, expires_at = create_session(user.id, session_version=user.session_version)
        set_auth_cookie(response, session_token, expires_at)
        return AuthUserResponse(user=AuthUser(
            id=str(user.id), name=user.username, email=user.email,
            phone=user.phone_number, has_password=user.password_hash is not None,
        ))

    except HTTPException:
        raise
    except passwords.PasswordCapacityError:
        raise HTTPException(503, "Sign-in is temporarily unavailable. Please retry.") from None
    except Exception as exc:
        logger.error("Login storage unavailable")
        raise HTTPException(status_code=500, detail="Internal server error") from exc


@router.get("/api/me", response_model=AuthUserResponse)
async def me(session_user: tuple[str, dict] = Depends(get_session_user)):
    _, user_data = session_user
    return AuthUserResponse(user=_safe_auth_user(user_data))


@router.post("/api/logout", status_code=204, dependencies=[Depends(mutation_origin)])
def logout(request: Request, response: Response):
    if request.headers.get('X-camos-account-id') is not None:
        try:
            get_canonical_user(request, request.cookies.get('camos_session'))
        except HTTPException as error:
            if (error.headers or {}).get('X-camos-auth-error') != 'session_invalid':
                raise
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
    from .provider_auth import clear_provider_cookies
    clear_provider_cookies(response)
