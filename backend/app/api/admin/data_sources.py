"""Admin data source endpoints."""

from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from backend.app.auth import authenticate_user
from backend.app.data.json_store import load_users, save_users

from .common import require_admin

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/data-sources/{client_id}")
async def get_data_sources(
    client_id: str,
    user: dict = Depends(authenticate_user),
):
    """Get data sources for a client (admin only)."""
    require_admin(user)

    users = load_users()

    if client_id not in users:
        raise HTTPException(status_code=404, detail="Client not found")

    if users[client_id]["role"] != "client":
        raise HTTPException(status_code=400, detail="User is not a client")

    data_sources = users[client_id].get("data_sources", [])

    return {"data_sources": data_sources, "client_id": client_id}


@router.post("/data-sources/{client_id}")
async def add_data_source(
    client_id: str,
    request: Dict[str, Any],
    user: dict = Depends(authenticate_user),
):
    """Add a data source for a client (admin only)."""
    require_admin(user)

    users = load_users()

    if client_id not in users:
        raise HTTPException(status_code=404, detail="Client not found")

    if users[client_id]["role"] != "client":
        raise HTTPException(status_code=400, detail="User is not a client")

    title = request.get("title", "").strip()
    url = request.get("url", "").strip()
    source_type = request.get("type", "Camera")

    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    if not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(
            status_code=400, detail="URL must start with http:// or https://"
        )

    if "data_sources" not in users[client_id]:
        users[client_id]["data_sources"] = []

    existing_sources = users[client_id]["data_sources"]
    source_id = f"source_{len(existing_sources) + 1}"

    is_first_source = len(existing_sources) == 0
    new_source = {
        "id": source_id,
        "title": title,
        "url": url,
        "type": source_type,
        "active": is_first_source,
    }

    users[client_id]["data_sources"].append(new_source)
    save_users(users)

    logger.info("Admin added data source %s for client %s", source_id, client_id)
    return {
        "success": True,
        "message": "Data source added successfully",
        "source": new_source,
    }


@router.put("/data-sources/{client_id}/{source_id}")
async def update_data_source(
    client_id: str,
    source_id: str,
    request: Dict[str, Any],
    user: dict = Depends(authenticate_user),
):
    """Update a data source for a client (admin only)."""
    require_admin(user)

    users = load_users()

    if client_id not in users:
        raise HTTPException(status_code=404, detail="Client not found")

    if users[client_id]["role"] != "client":
        raise HTTPException(status_code=400, detail="User is not a client")

    data_sources = users[client_id].get("data_sources", [])

    if "title" in request and not request["title"].strip():
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    if "url" in request:
        url = request["url"].strip()
        if not url:
            raise HTTPException(status_code=400, detail="URL cannot be empty")
        if not (url.startswith("http://") or url.startswith("https://")):
            raise HTTPException(
                status_code=400,
                detail="URL must start with http:// or https://",
            )
    if "type" in request and request["type"] not in ["Camera", "Sensor", "Gateway"]:
        raise HTTPException(
            status_code=400, detail="Type must be Camera, Sensor, or Gateway"
        )

    source_found = False
    for source in data_sources:
        if source["id"] == source_id:
            if "title" in request:
                source["title"] = request["title"].strip()
            if "url" in request:
                source["url"] = request["url"].strip()
            if "type" in request:
                source["type"] = request["type"]
            source_found = True
            break

    if not source_found:
        raise HTTPException(status_code=404, detail="Data source not found")

    save_users(users)

    logger.info("Admin updated data source %s for client %s", source_id, client_id)
    return {"success": True, "message": "Data source updated successfully"}


@router.delete("/data-sources/{client_id}/{source_id}")
async def delete_data_source(
    client_id: str,
    source_id: str,
    user: dict = Depends(authenticate_user),
):
    """Delete a data source for a client (admin only)."""
    require_admin(user)

    users = load_users()

    if client_id not in users:
        raise HTTPException(status_code=404, detail="Client not found")

    if users[client_id]["role"] != "client":
        raise HTTPException(status_code=400, detail="User is not a client")

    data_sources = users[client_id].get("data_sources", [])

    was_active = any(
        source["id"] == source_id and source.get("active", False)
        for source in data_sources
    )

    initial_length = len(data_sources)
    users[client_id]["data_sources"] = [
        s for s in data_sources if s["id"] != source_id
    ]

    if len(users[client_id]["data_sources"]) == initial_length:
        raise HTTPException(status_code=404, detail="Data source not found")

    for idx, source in enumerate(users[client_id]["data_sources"]):
        source["id"] = f"source_{idx + 1}"

    if was_active and len(users[client_id]["data_sources"]) > 0:
        users[client_id]["data_sources"][0]["active"] = True

    save_users(users)

    logger.info("Admin deleted data source %s for client %s", source_id, client_id)
    return {"success": True, "message": "Data source deleted successfully"}


@router.post("/data-sources/{client_id}/{source_id}/set-active")
async def set_active_data_source(
    client_id: str,
    source_id: str,
    user: dict = Depends(authenticate_user),
):
    """Set a data source as active for a client (admin only)."""
    require_admin(user)

    users = load_users()

    if client_id not in users:
        raise HTTPException(status_code=404, detail="Client not found")

    if users[client_id]["role"] != "client":
        raise HTTPException(status_code=400, detail="User is not a client")

    data_sources = users[client_id].get("data_sources", [])

    source_found = False
    for source in data_sources:
        if source["id"] == source_id:
            source["active"] = True
            source_found = True
        else:
            source["active"] = False

    if not source_found:
        raise HTTPException(status_code=404, detail="Data source not found")

    save_users(users)

    logger.info("Admin set data source %s as active for client %s", source_id, client_id)
    return {"success": True, "message": "Data source activated successfully"}
