"""Postmark email integration for signup verification flows."""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from urllib import error, request

POSTMARK_EMAIL_ENDPOINT = "https://api.postmarkapp.com/email"

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
        return (int(error_code) if isinstance(error_code, int) else None, message if isinstance(message, str) else None)
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
    )


def _require_admin_notify_email() -> str:
    admin_notify_email = os.getenv("ADMIN_NOTIFY_EMAIL", "").strip()
    if not admin_notify_email:
        raise PostmarkConfigurationError("Email service is not configured. Missing ADMIN_NOTIFY_EMAIL.")
    return admin_notify_email


def _postmark_send(*, token: str, payload: dict, from_email: str, to_email: str) -> None:
    req = request.Request(
        POSTMARK_EMAIL_ENDPOINT,
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
            if response.status >= 300:
                body = response.read().decode("utf-8", errors="replace")
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


def send_verification_email(*, to_email: str, code: str) -> None:
    config = _load_config()
    payload = {
        "From": config.from_email,
        "To": to_email,
        "Subject": "Your camOS verification code",
        "TextBody": (
            f"Your camOS verification code is {code}.\n\n"
            "It expires in 15 minutes."
        ),
    }
    _postmark_send(
        token=config.server_token,
        payload=payload,
        from_email=config.from_email,
        to_email=to_email,
    )


def send_admin_signup_notification(*, verified_email: str, name: str, username: str, timestamp: str) -> None:
    config = _load_config()
    admin_notify_email = _require_admin_notify_email()
    payload = {
        "From": config.from_email,
        "To": admin_notify_email,
        "Subject": f"New verified signup: {verified_email}",
        "TextBody": (
            "A new user has verified their email and completed signup.\n\n"
            f"Email: {verified_email}\n"
            f"Name: {name}\n"
            f"Username: {username}\n"
            f"Timestamp (UTC): {timestamp}\n"
        ),
    }
    _postmark_send(
        token=config.server_token,
        payload=payload,
        from_email=config.from_email,
        to_email=admin_notify_email,
    )


def send_admin_contact_notification(
    *,
    name: str,
    email: str,
    phone: str | None,
    message: str,
    attachment_names: list[str],
    attachments: list[PostmarkAttachment] | None = None,
) -> None:
    config = _load_config()
    admin_notify_email = _require_admin_notify_email()
    attachments_line = ", ".join(attachment_names) if attachment_names else "None"
    payload = {
        "From": config.from_email,
        "To": admin_notify_email,
        "Subject": f"New contact submission: {name}",
        "TextBody": (
            "A new contact form submission has been received.\n\n"
            f"Name: {name}\n"
            f"Email: {email}\n"
            f"Phone: {phone if phone else 'Not provided'}\n"
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

    _postmark_send(
        token=config.server_token,
        payload=payload,
        from_email=config.from_email,
        to_email=admin_notify_email,
    )



def send_contact_confirmation_email(*, to_email: str, name: str) -> None:
    config = _load_config()
    greeting = f"Hi {name}," if name.strip() else "Hello,"
    payload = {
        "From": config.from_email,
        "To": to_email,
        "Subject": "We received your message",
        "TextBody": (
            f"{greeting}\n\n"
            "Thank you for contacting camOS.\n"
            "We have received your message and our team will review it.\n"
            "We will get back to you as appropriate.\n\n"
            "Regards,\n"
            "camOS Team\n"
        ),
    }
    _postmark_send(
        token=config.server_token,
        payload=payload,
        from_email=config.from_email,
        to_email=to_email,
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
    )


def send_invite_user_email(*, to_email: str, inviter_username: str, access_level: str, site: str, signup_url: str) -> None:
    config = _load_config()
    payload = {
        "From": config.from_email,
        "To": to_email,
        "Subject": f"[{inviter_username}] has invited you to camOS",
        "TextBody": (
            f"{inviter_username} has invited you to camOS.\n\n"
            f"Role: {access_level}\n"
            f"Site: {site}\n\n"
            "Create your account here:\n"
            f"{signup_url}\n"
        ),
    }
    _postmark_send(
        token=config.server_token,
        payload=payload,
        from_email=config.from_email,
        to_email=to_email,
    )
