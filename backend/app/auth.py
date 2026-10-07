"""
Authentication utilities for camOS Analytics API
"""

import hashlib
import os
import secrets
from datetime import datetime, timezone

from fastapi import Cookie, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from .data.json_store import load_users, save_users
from .services.session_tokens import InvalidSession, SESSION_SECONDS, verify_session_claims

security = HTTPBasic()
SESSION_COOKIE_NAME = "camos_session"


def set_auth_cookie(response: Response, token: str, expires_at: int | None = None) -> None:
    secure = os.getenv("PORTAL_SESSION_SECURE", "").lower() == "true" or (
        not os.getenv("PORTAL_SESSION_SECURE") and os.getenv("NODE_ENV") == "production"
    )
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=secure,
        path="/",
        max_age=SESSION_SECONDS if expires_at is not None else None,
        expires=datetime.fromtimestamp(expires_at, timezone.utc) if expires_at is not None else None,
    )


def clear_auth_cookie(response: Response) -> None:
    secure = os.getenv("PORTAL_SESSION_SECURE", "").lower() == "true" or (
        not os.getenv("PORTAL_SESSION_SECURE") and os.getenv("NODE_ENV") == "production"
    )
    response.delete_cookie(
        key=SESSION_COOKIE_NAME, path="/", httponly=True,
        samesite="lax", secure=secure,
    )


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify password against stored hash."""
    try:
        if stored_hash.startswith("pbkdf2_sha256$"):
            _, iterations, salt, digest = stored_hash.split("$", 3)
            computed = hashlib.pbkdf2_hmac(
                "sha256",
                password.encode("utf-8"),
                salt.encode("utf-8"),
                int(iterations),
            ).hex()
            return secrets.compare_digest(computed, digest)

        if ':' not in stored_hash:
            return password == stored_hash

        salt, hash_part = stored_hash.split(':', 1)
        password_hash = hashlib.sha256((password + salt).encode()).hexdigest()
        return secrets.compare_digest(password_hash, hash_part)
    except Exception:
        return False


def require_legacy_password_auth():
    if os.getenv("PORTAL_LEGACY_PASSWORD_AUTH", "").lower() != "true" or os.getenv("NODE_ENV") == "production":
        raise HTTPException(410, "Legacy password authentication is disabled")


def authenticate_user(credentials: HTTPBasicCredentials = Depends(security)):
    """Authenticate user and update last login timestamp."""
    require_legacy_password_auth()
    users = load_users()

    if credentials.username not in users:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )

    user = users[credentials.username]
    password_hash = user.get("password_hash") or user.get("password", "")

    if not verify_password(credentials.password, password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )

    users[credentials.username]['last_login'] = datetime.now(timezone.utc).isoformat()
    save_users(users)

    return {
        'username': credentials.username,
        'role': user['role'],
        'name': user.get('name', credentials.username)
    }


def get_session_user(
    request: Request,
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = get_canonical_user(request, session_token)
    return user.document_owner_key or user.username, {
        "id": str(user.id), "name": user.username, "email": user.email,
        "phone": user.phone_number, "role": "client", "account_version": user.account_version,
    }


def get_canonical_user(
    request: Request,
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    if not session_token:
        raise HTTPException(status_code=401, detail="Unauthenticated")
    try:
        user_id, version = verify_session_claims(session_token)
        user = request.app.state.auth_repository.get_enabled_user(user_id)
        if user is not None and user.session_version != version:
            user = None
    except (InvalidSession, RuntimeError):
        user = None
    if user is None:
        raise HTTPException(status_code=401, detail="Unauthenticated")
    return user
