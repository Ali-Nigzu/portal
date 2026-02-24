"""
Authentication utilities for camOS Analytics API
"""

import hashlib
import secrets
from datetime import datetime, timezone

from fastapi import Cookie, Depends, HTTPException, Response, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from .data.json_store import load_users, save_users

security = HTTPBasic()
SESSION_COOKIE_NAME = "camos_session"


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session_token() -> str:
    return secrets.token_urlsafe(32)


def set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")


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


def authenticate_user(credentials: HTTPBasicCredentials = Depends(security)):
    """Authenticate user and update last login timestamp."""
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


def get_session_user(session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME)):
    if not session_token:
        raise HTTPException(status_code=401, detail="Unauthenticated")

    users = load_users()
    token_hash = hash_session_token(session_token)
    for username, user_data in users.items():
        if user_data.get("session_token_hash") == token_hash:
            return username, user_data

    raise HTTPException(status_code=401, detail="Unauthenticated")
