"""Signed, absolute-expiry browser sessions containing only canonical user identity."""

import base64
import hashlib
import hmac
import json
import os
import secrets
import time

SESSION_SECONDS = 365 * 24 * 60 * 60


class InvalidSession(ValueError):
    pass


def _secret() -> bytes:
    value = os.getenv("PORTAL_SESSION_SECRET", "")
    if len(value) < 32:
        raise RuntimeError("PORTAL_SESSION_SECRET must contain at least 32 characters")
    return value.encode()


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def create_session(user_id: int, now: int | None = None) -> tuple[str, int]:
    issued = int(time.time() if now is None else now)
    expires = issued + SESSION_SECONDS
    payload = json.dumps(
        {"user_id": str(user_id), "issued_at": issued, "expires_at": expires,
         "nonce": secrets.token_urlsafe(12)},
        separators=(",", ":"), sort_keys=True,
    ).encode()
    signature = hmac.new(_secret(), payload, hashlib.sha256).digest()
    return f"{_encode(payload)}.{_encode(signature)}", expires


def verify_session(token: str, now: int | None = None) -> int:
    try:
        encoded_payload, encoded_signature = token.split(".", 1)
        payload = _decode(encoded_payload)
        signature = _decode(encoded_signature)
        expected = hmac.new(_secret(), payload, hashlib.sha256).digest()
        if not hmac.compare_digest(signature, expected):
            raise InvalidSession()
        value = json.loads(payload)
        if set(value) != {"user_id", "issued_at", "expires_at", "nonce"}:
            raise InvalidSession()
        current = int(time.time() if now is None else now)
        issued, expires = int(value["issued_at"]), int(value["expires_at"])
        if expires - issued != SESSION_SECONDS or current < issued or current >= expires:
            raise InvalidSession()
        user_id = int(value["user_id"])
        if user_id < 0 or str(user_id) != value["user_id"]:
            raise InvalidSession()
        return user_id
    except (ValueError, TypeError, KeyError, json.JSONDecodeError, UnicodeDecodeError):
        raise InvalidSession() from None
