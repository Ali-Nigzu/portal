"""
Authentication utilities for camOS Analytics API
"""

from backend.app.services.cookie_policy import session_cookie_secure

from datetime import datetime, timezone

from fastapi import Cookie, HTTPException, Request, Response

from .services.session_tokens import InvalidSession, SESSION_SECONDS, verify_session_claims

SESSION_COOKIE_NAME = "camos_session"


def set_auth_cookie(response: Response, token: str, expires_at: int | None = None) -> None:
    secure = session_cookie_secure()
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
    secure = session_cookie_secure()
    response.delete_cookie(
        key=SESSION_COOKIE_NAME, path="/", httponly=True,
        samesite="lax", secure=secure,
    )


def get_session_user(
    request: Request,
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = get_canonical_user(request, session_token)
    return user.username, {
        "id": str(user.id), "name": user.username, "email": user.email,
        "phone": user.phone_number, "role": "client",
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
    if user is None or user.id == 999999:
        raise HTTPException(status_code=401, detail="Unauthenticated")
    return user
