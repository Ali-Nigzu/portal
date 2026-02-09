"""Authentication context helpers for API routes."""

from __future__ import annotations

import base64
from typing import Any, Dict, Optional, Tuple

from fastapi import HTTPException, Request, status

from backend.app.auth import verify_password
from backend.app.data.json_store import load_users
from backend.app.view_tokens import validate_view_token
from backend.app.services.demo_session import resolve_demo_org_id


def org_id_for_user_record(username: str, user_record: Dict[str, Any]) -> str:
    explicit = user_record.get("orgId") or user_record.get("org_id")
    if isinstance(explicit, str) and explicit.strip():
        return explicit.strip()
    raise HTTPException(
        status_code=422,
        detail={
            "error": "missing_org",
            "message": f"User '{username}' is missing orgId configuration",
        },
    )


def _decode_basic_auth(auth_header: str) -> Tuple[str, str]:
    if not auth_header.startswith("Basic "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    try:
        decoded = base64.b64decode(auth_header.split(" ", 1)[1]).decode("utf-8")
        username, password = decoded.split(":", 1)
        return username, password
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        ) from exc


def _load_user(username: str, password: str) -> Dict[str, Any]:
    users = load_users()
    if username not in users or not verify_password(password, users[username]["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    return users[username]


def resolve_view_token_context(view_token: str) -> str:
    token_data = validate_view_token(view_token)
    if not token_data:
        raise HTTPException(status_code=401, detail="Invalid or expired view token")

    users = load_users()
    client_id = token_data["client_id"]

    if client_id not in users:
        raise HTTPException(status_code=404, detail="Client not found")

    user_record = users[client_id]
    return org_id_for_user_record(client_id, user_record)


def authenticate_chart_data_request(
    request: Request,
    view_token: Optional[str],
    client_id: Optional[str] = None,
) -> str:
    """Authenticate chart data requests via view token or Basic auth."""
    if view_token:
        return resolve_view_token_context(view_token)

    auth_header = request.headers.get("Authorization")
    if not auth_header:
        demo_org = resolve_demo_org_id(request)
        if demo_org:
            return demo_org
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    username, password = _decode_basic_auth(auth_header)
    users = load_users()
    if username not in users or not verify_password(password, users[username]["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    user_record = users[username]
    if user_record.get("role") == "admin" and client_id:
        if client_id not in users:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Client '{client_id}' not found",
            )
        return org_id_for_user_record(client_id, users[client_id])
    return org_id_for_user_record(username, user_record)


def resolve_snapshot_org(
    *,
    request: Request,
    org_id: Optional[str],
    view_token: Optional[str],
) -> str:
    explicit_org = org_id or request.query_params.get("org") or request.query_params.get("orgId")
    if explicit_org:
        return explicit_org

    resolved_view_token = view_token or request.query_params.get("viewToken") or request.query_params.get("view_token")
    if resolved_view_token:
        return resolve_view_token_context(resolved_view_token)

    demo_org = resolve_demo_org_id(request)
    if demo_org:
        return demo_org

    raise HTTPException(
        status_code=422,
        detail={"error": "missing_org", "message": "org or viewToken is required"},
    )


def resolve_client_from_request(
    request: Request,
    *,
    view_token: Optional[str] = None,
    client_id: Optional[str] = None,
) -> str:
    """Resolve a client id for alarm/device routes via view token or basic auth."""
    if view_token:
        token_data = validate_view_token(view_token)
        if not token_data:
            raise HTTPException(status_code=401, detail="Invalid or expired view token")
        return token_data["client_id"]

    auth_header = request.headers.get("Authorization")
    if not auth_header:
        demo_org = resolve_demo_org_id(request)
        if demo_org:
            return demo_org
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    username, password = _decode_basic_auth(auth_header)
    user_record = _load_user(username, password)
    user_role = user_record.get("role")
    if user_role == "client":
        return username
    if user_role == "admin" and client_id:
        return client_id
    return username
