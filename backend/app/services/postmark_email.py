"""Postmark email integration for signup verification flows."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from urllib import error, request

POSTMARK_EMAIL_ENDPOINT = "https://api.postmarkapp.com/email"


class PostmarkConfigurationError(RuntimeError):
    """Raised when required Postmark env vars are missing."""


class PostmarkDeliveryError(RuntimeError):
    """Raised when Postmark rejects or fails to deliver an email."""


@dataclass(frozen=True)
class PostmarkConfig:
    server_token: str
    from_email: str
    admin_notify_email: str



def _load_config() -> PostmarkConfig:
    server_token = os.getenv("POSTMARK_SERVER_TOKEN", "").strip()
    from_email = os.getenv("POSTMARK_FROM_EMAIL", "").strip()
    admin_notify_email = os.getenv("ADMIN_NOTIFY_EMAIL", "").strip()
    missing = [
        name
        for name, value in (
            ("POSTMARK_SERVER_TOKEN", server_token),
            ("POSTMARK_FROM_EMAIL", from_email),
            ("ADMIN_NOTIFY_EMAIL", admin_notify_email),
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
        admin_notify_email=admin_notify_email,
    )


def _postmark_send(*, token: str, payload: dict) -> None:
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
    try:
        with request.urlopen(req, timeout=10) as response:
            if response.status >= 300:
                body = response.read().decode("utf-8", errors="replace")
                raise PostmarkDeliveryError(
                    f"Postmark send failed with status {response.status}: {body}"
                )
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise PostmarkDeliveryError(
            f"Postmark send failed with status {exc.code}: {body}"
        ) from exc
    except error.URLError as exc:
        raise PostmarkDeliveryError(f"Postmark send failed: {exc}") from exc


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
    _postmark_send(token=config.server_token, payload=payload)


def send_admin_signup_notification(*, verified_email: str, name: str, username: str, timestamp: str) -> None:
    config = _load_config()
    payload = {
        "From": config.from_email,
        "To": config.admin_notify_email,
        "Subject": f"New verified signup: {verified_email}",
        "TextBody": (
            "A new user has verified their email and completed signup.\n\n"
            f"Email: {verified_email}\n"
            f"Name: {name}\n"
            f"Username: {username}\n"
            f"Timestamp (UTC): {timestamp}\n"
        ),
    }
    _postmark_send(token=config.server_token, payload=payload)
