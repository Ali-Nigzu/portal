"""Reserved canonical identity and a separate eight-hour signed session purpose."""

from backend.app.services.cookie_policy import session_cookie_secure

import hashlib
import hmac
import json
import secrets
import time
from datetime import datetime, timezone
from fastapi import Cookie, HTTPException, Request, Response
from .session_tokens import InvalidSession, _secret, _encode, _decode

ADMIN_ID = 999999
COOKIE = "camos_admin_session"
SECONDS = 8 * 60 * 60
DOMAIN = b"camos:admin-session:v1\x00"


def create_admin_session(user_id, version, now=None):
    issued = int(time.time() if now is None else now)
    value = {
        "purpose": "admin",
        "user_id": str(user_id),
        "session_version": str(version),
        "issued_at": issued,
        "expires_at": issued + SECONDS,
        "nonce": secrets.token_urlsafe(12),
    }
    payload = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    signature = hmac.new(_secret(), DOMAIN + payload, hashlib.sha256).digest()
    return f"{_encode(payload)}.{_encode(signature)}", issued + SECONDS


def verify_admin_session(token, now=None):
    try:
        p, s = token.split(".", 1)
        payload = _decode(p)
        if not hmac.compare_digest(
            _decode(s), hmac.new(_secret(), DOMAIN + payload, hashlib.sha256).digest()
        ):
            raise InvalidSession()
        value = json.loads(payload)
        if set(value) != {
            "purpose",
            "user_id",
            "session_version",
            "issued_at",
            "expires_at",
            "nonce",
        }:
            raise InvalidSession()
        if value["purpose"] != "admin" or value["user_id"] != str(ADMIN_ID):
            raise InvalidSession()
        version = int(value["session_version"])
        if (
            version < 0
            or version > 2**63 - 1
            or str(version) != value["session_version"]
        ):
            raise InvalidSession()
        issued, expires = value["issued_at"], value["expires_at"]
        current = int(time.time() if now is None else now)
        if (
            type(issued) is not int
            or type(expires) is not int
            or expires - issued != SECONDS
            or not issued <= current < expires
        ):
            raise InvalidSession()
        return ADMIN_ID, version
    except (ValueError, TypeError, KeyError, UnicodeDecodeError):
        raise InvalidSession() from None


def admin_user(
    request: Request, token: str | None = Cookie(default=None, alias=COOKIE)
):
    try:
        if not token:
            raise InvalidSession()
        uid, version = verify_admin_session(token)
        user = request.app.state.auth_repository.get_enabled_user(uid)
        if user is None or user.id != ADMIN_ID or user.session_version != version:
            raise InvalidSession()
        return user
    except (InvalidSession, RuntimeError):
        raise HTTPException(401, "Unauthenticated") from None
    except Exception:
        raise HTTPException(
            503, "Admin authentication temporarily unavailable"
        ) from None


def cookie_options():
    secure = session_cookie_secure()
    return dict(httponly=True, secure=secure, samesite="lax", path="/")


def set_admin_cookie(response: Response, token, expires):
    response.set_cookie(
        COOKIE,
        token,
        max_age=SECONDS,
        expires=datetime.fromtimestamp(expires, timezone.utc),
        **cookie_options(),
    )


def clear_admin_cookie(response: Response):
    response.delete_cookie(COOKIE, **cookie_options())
