"""Postmark email integration for signup verification flows."""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from urllib import error, request

DEFAULT_POSTMARK_EMAIL_ENDPOINT = "https://api.postmarkapp.com/email"

logger = logging.getLogger(__name__)


class PostmarkConfigurationError(RuntimeError):
    """Raised when required Postmark env vars are missing."""


class PostmarkDeliveryError(RuntimeError):
    """Raised when Postmark rejects or fails to deliver an email."""

    def __init__(
        self,
        *,
        status_code: int | None,
        response_body: str,
        error_code: int | None,
        error_message: str | None,
        from_email: str,
        to_email_masked: str,
    ):
        self.status_code = status_code
        self.response_body = response_body
        self.error_code = error_code
        self.error_message = error_message
        self.from_email = from_email
        self.to_email_masked = to_email_masked
        super().__init__(
            f"Postmark send failed status={status_code} error_code={error_code} message={error_message}"
        )


@dataclass(frozen=True)
class PostmarkConfig:
    server_token: str
    from_email: str
    endpoint: str


@dataclass(frozen=True)
class PostmarkSendResult:
    message_id: str | None
    submitted_at: str | None
    to_email_masked: str


@dataclass(frozen=True)
class PostmarkAttachment:
    name: str
    content_base64: str
    content_type: str


def _mask_email(email: str) -> str:
    if "@" not in email:
        return "***"
    local, domain = email.split("@", 1)
    if len(local) <= 2:
        masked_local = f"{local[:1]}***"
    else:
        masked_local = f"{local[:2]}***"
    return f"{masked_local}@{domain}"


def _parse_postmark_error(body: str) -> tuple[int | None, str | None]:
    try:
        data = json.loads(body)
        error_code = data.get("ErrorCode")
        message = data.get("Message")
        return (
            int(error_code) if isinstance(error_code, int) else None,
            message if isinstance(message, str) else None,
        )
    except Exception:
        return None, None


def _load_config() -> PostmarkConfig:
    server_token = os.getenv("POSTMARK_SERVER_TOKEN", "").strip()
    from_email = os.getenv("POSTMARK_FROM_EMAIL", "").strip()
    missing = [
        name
        for name, value in (
            ("POSTMARK_SERVER_TOKEN", server_token),
            ("POSTMARK_FROM_EMAIL", from_email),
        )
        if not value
    ]
    if missing:
        joined = ", ".join(missing)
        raise PostmarkConfigurationError(
            f"Email service is not configured. Missing {joined}."
        )
    return PostmarkConfig(
        server_token=server_token,
        from_email=from_email,
        endpoint=(
            os.getenv("POSTMARK_EMAIL_ENDPOINT", DEFAULT_POSTMARK_EMAIL_ENDPOINT).strip()
            or DEFAULT_POSTMARK_EMAIL_ENDPOINT
        ),
    )


DEFAULT_ADMIN_NOTIFY_EMAIL = "ali@camos.app"
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _admin_notify_recipients() -> list[str]:
    """Return admin notification recipients, always including Ali.

    ADMIN_NOTIFY_EMAIL may add extra recipients, but it cannot replace the
    production-required Ali notification target. Invalid entries are ignored so
    an optional override cannot break internal notifications.
    """
    recipients: list[str] = [DEFAULT_ADMIN_NOTIFY_EMAIL]
    configured = os.getenv("ADMIN_NOTIFY_EMAIL", "")
    for candidate in re.split(r"[,;]", configured):
        email = candidate.strip()
        if not email:
            continue
        if not EMAIL_RE.match(email):
            logger.warning("postmark.admin_notify.invalid_recipient_ignored recipient=%s", email)
            continue
        if email.lower() not in {item.lower() for item in recipients}:
            recipients.append(email)
    return recipients


def _require_admin_notify_email() -> str:
    return ", ".join(_admin_notify_recipients())


def _postmark_send(
    *, token: str, payload: dict, from_email: str, to_email: str, endpoint: str
) -> PostmarkSendResult:
    req = request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Postmark-Server-Token": token,
        },
        method="POST",
    )
    to_email_masked = _mask_email(to_email)
    try:
        with request.urlopen(req, timeout=10) as response:
            body = response.read().decode("utf-8", errors="replace")
            if response.status >= 300:
                error_code, error_message = _parse_postmark_error(body)
                logger.error(
                    "postmark.send.failed status=%s error_code=%s message=%s from_email=%s to_email=%s response_body=%s",
                    response.status,
                    error_code,
                    error_message,
                    from_email,
                    to_email_masked,
                    body,
                )
                raise PostmarkDeliveryError(
                    status_code=response.status,
                    response_body=body,
                    error_code=error_code,
                    error_message=error_message,
                    from_email=from_email,
                    to_email_masked=to_email_masked,
                )
            message_id = None
            submitted_at = None
            try:
                data = json.loads(body) if body else {}
                message_id = data.get("MessageID") if isinstance(data.get("MessageID"), str) else None
                submitted_at = data.get("SubmittedAt") if isinstance(data.get("SubmittedAt"), str) else None
            except Exception:
                pass
            logger.info(
                "postmark.send.success status=%s message_id=%s from_email=%s to_email=%s",
                response.status,
                message_id,
                from_email,
                to_email_masked,
            )
            return PostmarkSendResult(
                message_id=message_id,
                submitted_at=submitted_at,
                to_email_masked=to_email_masked,
            )
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        error_code, error_message = _parse_postmark_error(body)
        logger.error(
            "postmark.send.http_error status=%s error_code=%s message=%s from_email=%s to_email=%s response_body=%s",
            exc.code,
            error_code,
            error_message,
            from_email,
            to_email_masked,
            body,
        )
        raise PostmarkDeliveryError(
            status_code=exc.code,
            response_body=body,
            error_code=error_code,
            error_message=error_message,
            from_email=from_email,
            to_email_masked=to_email_masked,
        ) from exc
    except error.URLError as exc:
        logger.error(
            "postmark.send.url_error from_email=%s to_email=%s reason=%s",
            from_email,
            to_email_masked,
            exc,
        )
        raise PostmarkDeliveryError(
            status_code=None,
            response_body=str(exc),
            error_code=None,
            error_message=str(exc),
            from_email=from_email,
            to_email_masked=to_email_masked,
        ) from exc


def send_verification_email(*, to_email: str, code: str) -> PostmarkSendResult:
    config = _load_config()
    logger.info("postmark.verification.trigger_start to_email=%s", _mask_email(to_email))
    payload = {
        "From": config.from_email,
        "To": to_email,
        "Subject": "Your camOS verification code",
        "TextBody": (
            f"Your camOS verification code is {code}.\n\n"
            "It expires in 15 minutes."
        ),
    }
    return _postmark_send(
        token=config.server_token,
        payload=payload,
        from_email=config.from_email,
        to_email=to_email,
        endpoint=config.endpoint,
    )


def send_admin_signup_notification(
    *,
    verified_email: str,
    name: str,
    username: str,
    timestamp: str,
    phone: str | None = None,
    source: str = "Signup verification",
) -> PostmarkSendResult:
    config = _load_config()
    admin_notify_email = _require_admin_notify_email()
    logger.info(
        "postmark.admin_signup.trigger_start to_email=%s signup_email=%s source=%s",
        _mask_email(admin_notify_email),
        _mask_email(verified_email),
        source,
    )
    environment = (
        os.getenv("REACT_APP_ENVIRONMENT")
        or os.getenv("ENVIRONMENT")
        or os.getenv("APP_ENV")
        or os.getenv("RAILWAY_ENVIRONMENT")
        or "Not provided"
    )
    payload = {
        "From": config.from_email,
        "To": admin_notify_email,
        "Subject": "New camOS Signup",
        "TextBody": (
            "A new camOS user has completed signup.\n\n"
            f"Name: {name or 'Not provided'}\n"
            f"Email: {verified_email}\n"
            "Company: Not captured\n"
            f"Signup timestamp (UTC): {timestamp}\n"
            f"Environment: {environment}\n\n"
            "Additional captured signup fields:\n"
            f"Username: {username}\n"
            f"Phone: {phone if phone else 'Not provided'}\n"
            f"Source: {source}\n"
        ),
    }
    return _postmark_send(
        token=config.server_token,
        payload=payload,
        from_email=config.from_email,
        to_email=admin_notify_email,
        endpoint=config.endpoint,
    )


def send_admin_contact_notification(
    *,
    name: str,
    email: str,
    phone: str | None,
    message: str,
    submitted_at: str,
    attachment_names: list[str],
    company: str | None = None,
    page_url: str | None = None,
    attachments: list[PostmarkAttachment] | None = None,
) -> PostmarkSendResult:
    config = _load_config()
    admin_notify_email = _require_admin_notify_email()
    logger.info(
        "postmark.admin_contact.trigger_start to_email=%s contact_email=%s attachments=%s",
        _mask_email(admin_notify_email),
        _mask_email(email),
        len(attachment_names),
    )
    attachments_line = ", ".join(attachment_names) if attachment_names else "None"
    page_url_line = page_url if page_url else "Not supplied"
    company_line = company if company else "Not supplied"
    payload = {
        "From": config.from_email,
        "To": admin_notify_email,
        "Subject": "New camOS Contact Request",
        "TextBody": (
            "A new camOS Contact Us submission has been received.\n\n"
            f"Name: {name}\n"
            f"Email: {email}\n"
            f"Phone: {phone if phone else 'Not supplied'}\n"
            f"Company: {company_line}\n"
            f"Submission timestamp (UTC): {submitted_at}\n"
            f"Page URL / context: {page_url_line}\n"
            f"Attachments: {attachments_line}\n\n"
            "Message:\n"
            f"{message}\n"
        ),
    }

    if attachments:
        payload["Attachments"] = [
            {
                "Name": item.name,
                "Content": item.content_base64,
                "ContentType": item.content_type,
            }
            for item in attachments
        ]

    return _postmark_send(
        token=config.server_token,
        payload=payload,
        from_email=config.from_email,
        to_email=admin_notify_email,
        endpoint=config.endpoint,
    )


def send_contact_confirmation_email(*, to_email: str, name: str, message: str | None = None) -> PostmarkSendResult:
    config = _load_config()
    logger.info("postmark.contact_confirmation.trigger_start to_email=%s", _mask_email(to_email))
    greeting = f"Hi {name}," if name.strip() else "Hello,"
    message_line = f"Message received: {message.strip()}\n\n" if message and message.strip() else ""
    payload = {
        "From": config.from_email,
        "To": to_email,
        "Subject": "We've received your message",
        "TextBody": (
            f"{greeting}\n\n"
            "Thank you for contacting camOS.\n\n"
            "We've received your message and will review it shortly. You can expect a response within 24 hours.\n\n"
            f"{message_line}"
            "If your enquiry relates to a camera deployment, site setup, or product demonstration, "
            "we will contact you as soon as possible.\n\n"
            "camOS\n"
            "Camera Operating Systems\n"
        ),
    }
    return _postmark_send(
        token=config.server_token,
        payload=payload,
        from_email=config.from_email,
        to_email=to_email,
        endpoint=config.endpoint,
    )


def send_settings_unlock_code_email(*, to_email: str, code: str) -> None:
    config = _load_config()
    payload = {
        "From": config.from_email,
        "To": to_email,
        "Subject": "Your camOS account unlock code",
        "TextBody": (
            f"Your camOS account unlock code is {code}.\n\n"
            "It expires in 15 minutes."
        ),
    }
    _postmark_send(
        token=config.server_token,
        payload=payload,
        from_email=config.from_email,
        to_email=to_email,
        endpoint=config.endpoint,
    )


def send_password_reset_code_email(*, to_email: str, code: str) -> None:
    config = _load_config()
    payload = {
        "From": config.from_email,
        "To": to_email,
        "Subject": "Your camOS password reset code",
        "TextBody": (
            f"Your camOS password reset code is {code}.\n\n"
            "It expires in 15 minutes."
        ),
    }
    _postmark_send(
        token=config.server_token,
        payload=payload,
        from_email=config.from_email,
        to_email=to_email,
        endpoint=config.endpoint,
    )
