"""Admin user endpoints."""

from __future__ import annotations

import logging
from typing import Dict

from fastapi import APIRouter, Depends, HTTPException

from backend.app.auth import authenticate_user
from backend.app.data.json_store import hash_password, load_users, save_users
from backend.app.models import (
    CreateUserRequest,
    CreateViewTokenRequest,
    UpdateUserRequest,
    ViewTokenResponse,
)
from backend.app.view_tokens import create_view_token

from .common import require_admin

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/create-view-token", response_model=ViewTokenResponse)
async def create_admin_view_token(
    token_request: CreateViewTokenRequest,
    user: dict = Depends(authenticate_user),
):
    """Create a temporary view token for a client (admin only)."""
    require_admin(user)

    users = load_users()

    if token_request.client_id not in users:
        raise HTTPException(status_code=404, detail="Client not found")

    if users[token_request.client_id]["role"] != "client":
        raise HTTPException(
            status_code=400, detail="Can only create view tokens for client users"
        )

    token_data = create_view_token(token_request.client_id)

    return ViewTokenResponse(**token_data)


@router.get("/users")
async def get_users(user: dict = Depends(authenticate_user)):
    """Get all users (admin only)."""
    require_admin(user)

    users = load_users()

    safe_users = []
    for username, user_data in users.items():
        safe_users.append(
            {
                "username": username,
                "name": user_data["name"],
                "role": user_data["role"],
                "orgId": user_data.get("orgId") or user_data.get("org_id"),
                "last_login": user_data.get("last_login"),
                "data_sources": user_data.get("data_sources", []),
            }
        )

    return {"users": safe_users}


@router.post("/users")
async def create_user(
    create_request: CreateUserRequest,
    user: dict = Depends(authenticate_user),
):
    """Create a new user (admin only)."""
    require_admin(user)

    users = load_users()

    if create_request.username in users:
        raise HTTPException(status_code=400, detail="Username already exists")

    if create_request.role == "client" and not create_request.org_id:
        raise HTTPException(status_code=422, detail="Client users must include orgId")

    users[create_request.username] = {
        "password": hash_password(create_request.password),
        "name": create_request.name,
        "role": create_request.role,
        "orgId": create_request.org_id,
        "last_login": None,
        "data_sources": [],
    }

    save_users(users)

    logger.info("Admin created user: %s", create_request.username)
    return {
        "success": True,
        "message": f"User {create_request.username} created successfully",
    }


@router.put("/users/{username}")
async def update_user(
    username: str,
    update_request: UpdateUserRequest,
    user: dict = Depends(authenticate_user),
):
    """Update an existing user (admin only)."""
    require_admin(user)

    users = load_users()

    if username not in users:
        raise HTTPException(status_code=404, detail="User not found")

    if update_request.name is not None:
        users[username]["name"] = update_request.name
    if update_request.password is not None:
        users[username]["password"] = hash_password(update_request.password)
    if update_request.role is not None:
        users[username]["role"] = update_request.role
    if update_request.org_id is not None:
        users[username]["orgId"] = update_request.org_id

    save_users(users)

    logger.info("Admin updated user: %s", username)
    return {"success": True, "message": f"User {username} updated successfully"}


@router.delete("/users/{username}")
async def delete_user(
    username: str,
    user: dict = Depends(authenticate_user),
):
    """Delete a user (admin only)."""
    require_admin(user)

    if username == user["username"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    users = load_users()

    if username not in users:
        raise HTTPException(status_code=404, detail="User not found")

    del users[username]
    save_users(users)

    logger.info("Admin deleted user: %s", username)
    return {"success": True, "message": f"User {username} deleted successfully"}
