"""Admin-only endpoints."""

from __future__ import annotations

import logging
import uuid
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from backend.app.auth import authenticate_user
from backend.app.data.json_store import (
    hash_password,
    load_alarm_logs,
    load_device_lists,
    load_users,
    save_alarm_logs,
    save_device_lists,
    save_users,
)
from backend.app.models import (
    CreateAlarmRequest,
    CreateDeviceRequest,
    CreateUserRequest,
    CreateViewTokenRequest,
    UpdateAlarmRequest,
    UpdateDeviceRequest,
    UpdateUserRequest,
    ViewTokenResponse,
)
from backend.app.view_tokens import create_view_token

router = APIRouter(prefix="/api/admin")
logger = logging.getLogger(__name__)


def _require_admin(user: dict) -> None:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


@router.post("/create-view-token", response_model=ViewTokenResponse)
async def create_admin_view_token(
    token_request: CreateViewTokenRequest,
    user: dict = Depends(authenticate_user),
):
    """Create a temporary view token for a client (admin only)."""
    _require_admin(user)

    users = load_users()

    if token_request.client_id not in users:
        raise HTTPException(status_code=404, detail="Client not found")

    if users[token_request.client_id]["role"] != "client":
        raise HTTPException(status_code=400, detail="Can only create view tokens for client users")

    token_data = create_view_token(token_request.client_id)

    return ViewTokenResponse(**token_data)


@router.get("/users")
async def get_users(user: dict = Depends(authenticate_user)):
    """Get all users (admin only)."""
    _require_admin(user)

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
    _require_admin(user)

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
    return {"success": True, "message": f"User {create_request.username} created successfully"}


@router.put("/users/{username}")
async def update_user(
    username: str,
    update_request: UpdateUserRequest,
    user: dict = Depends(authenticate_user),
):
    """Update an existing user (admin only)."""
    _require_admin(user)

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
    _require_admin(user)

    if username == user["username"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    users = load_users()

    if username not in users:
        raise HTTPException(status_code=404, detail="User not found")

    del users[username]
    save_users(users)

    logger.info("Admin deleted user: %s", username)
    return {"success": True, "message": f"User {username} deleted successfully"}


@router.get("/data-sources/{client_id}")
async def get_data_sources(
    client_id: str,
    user: dict = Depends(authenticate_user),
):
    """Get data sources for a client (admin only)."""
    _require_admin(user)

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
    _require_admin(user)

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
        raise HTTPException(status_code=400, detail="URL must start with http:// or https://")

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
    return {"success": True, "message": "Data source added successfully", "source": new_source}


@router.put("/data-sources/{client_id}/{source_id}")
async def update_data_source(
    client_id: str,
    source_id: str,
    request: Dict[str, Any],
    user: dict = Depends(authenticate_user),
):
    """Update a data source for a client (admin only)."""
    _require_admin(user)

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
            raise HTTPException(status_code=400, detail="URL must start with http:// or https://")
    if "type" in request and request["type"] not in ["Camera", "Sensor", "Gateway"]:
        raise HTTPException(status_code=400, detail="Type must be Camera, Sensor, or Gateway")

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
    _require_admin(user)

    users = load_users()

    if client_id not in users:
        raise HTTPException(status_code=404, detail="Client not found")

    if users[client_id]["role"] != "client":
        raise HTTPException(status_code=400, detail="User is not a client")

    data_sources = users[client_id].get("data_sources", [])

    was_active = any(source["id"] == source_id and source.get("active", False) for source in data_sources)

    initial_length = len(data_sources)
    users[client_id]["data_sources"] = [s for s in data_sources if s["id"] != source_id]

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
    _require_admin(user)

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


@router.post("/alarm-logs")
async def create_alarm_log(
    create_request: CreateAlarmRequest,
    user: dict = Depends(authenticate_user),
):
    """Create a new alarm log (admin only)."""
    _require_admin(user)

    alarm_data = load_alarm_logs()

    if create_request.client_id not in alarm_data:
        alarm_data[create_request.client_id] = []

    new_alarm = {
        "id": f"alarm-{str(uuid.uuid4())[:8]}",
        "instance": create_request.instance,
        "device": create_request.device,
        "description": create_request.description,
        "alarmStartedAt": create_request.alarmStartedAt,
        "alarmClearedAfter": create_request.alarmClearedAfter,
        "severity": create_request.severity,
        "client_id": create_request.client_id,
    }

    alarm_data[create_request.client_id].append(new_alarm)
    save_alarm_logs(alarm_data)

    logger.info("Admin created alarm: %s for client: %s", new_alarm["id"], create_request.client_id)
    return {"success": True, "alarm": new_alarm}


@router.put("/alarm-logs/{alarm_id}")
async def update_alarm_log(
    alarm_id: str,
    update_request: UpdateAlarmRequest,
    user: dict = Depends(authenticate_user),
):
    """Update an existing alarm log (admin only)."""
    _require_admin(user)

    alarm_data = load_alarm_logs()

    for client_id, alarms in alarm_data.items():
        for alarm in alarms:
            if alarm["id"] == alarm_id:
                if update_request.instance is not None:
                    alarm["instance"] = update_request.instance
                if update_request.device is not None:
                    alarm["device"] = update_request.device
                if update_request.description is not None:
                    alarm["description"] = update_request.description
                if update_request.alarmStartedAt is not None:
                    alarm["alarmStartedAt"] = update_request.alarmStartedAt
                if update_request.alarmClearedAfter is not None:
                    alarm["alarmClearedAfter"] = update_request.alarmClearedAfter
                if update_request.severity is not None:
                    alarm["severity"] = update_request.severity

                save_alarm_logs(alarm_data)
                logger.info("Admin updated alarm: %s", alarm_id)
                return {"success": True, "alarm": alarm}

    raise HTTPException(status_code=404, detail="Alarm not found")


@router.delete("/alarm-logs/{alarm_id}")
async def delete_alarm_log(
    alarm_id: str,
    user: dict = Depends(authenticate_user),
):
    """Delete an alarm log (admin only)."""
    _require_admin(user)

    alarm_data = load_alarm_logs()

    for client_id, alarms in alarm_data.items():
        for i, alarm in enumerate(alarms):
            if alarm["id"] == alarm_id:
                alarms.pop(i)
                save_alarm_logs(alarm_data)
                logger.info("Admin deleted alarm: %s", alarm_id)
                return {"success": True, "message": f"Alarm {alarm_id} deleted successfully"}

    raise HTTPException(status_code=404, detail="Alarm not found")


@router.post("/device-list")
async def create_device(
    create_request: CreateDeviceRequest,
    user: dict = Depends(authenticate_user),
):
    """Create a new device (admin only)."""
    _require_admin(user)

    device_data = load_device_lists()

    if create_request.client_id not in device_data:
        device_data[create_request.client_id] = []

    new_device = {
        "id": f"device-{str(uuid.uuid4())[:8]}",
        "name": create_request.name,
        "type": create_request.type,
        "status": create_request.status,
        "lastSeen": create_request.lastSeen,
        "dataSource": create_request.dataSource,
        "location": create_request.location,
        "recordCount": create_request.recordCount,
        "client_id": create_request.client_id,
    }

    device_data[create_request.client_id].append(new_device)
    save_device_lists(device_data)

    logger.info("Admin created device: %s for client: %s", new_device["id"], create_request.client_id)
    return {"success": True, "device": new_device}


@router.put("/device-list/{device_id}")
async def update_device(
    device_id: str,
    update_request: UpdateDeviceRequest,
    user: dict = Depends(authenticate_user),
):
    """Update an existing device (admin only)."""
    _require_admin(user)

    device_data = load_device_lists()

    for client_id, devices in device_data.items():
        for device in devices:
            if device["id"] == device_id:
                if update_request.name is not None:
                    device["name"] = update_request.name
                if update_request.type is not None:
                    device["type"] = update_request.type
                if update_request.status is not None:
                    device["status"] = update_request.status
                if update_request.lastSeen is not None:
                    device["lastSeen"] = update_request.lastSeen
                if update_request.dataSource is not None:
                    device["dataSource"] = update_request.dataSource
                if update_request.location is not None:
                    device["location"] = update_request.location
                if update_request.recordCount is not None:
                    device["recordCount"] = update_request.recordCount

                save_device_lists(device_data)
                logger.info("Admin updated device: %s", device_id)
                return {"success": True, "device": device}

    raise HTTPException(status_code=404, detail="Device not found")


@router.delete("/device-list/{device_id}")
async def delete_device(
    device_id: str,
    user: dict = Depends(authenticate_user),
):
    """Delete a device (admin only)."""
    _require_admin(user)

    device_data = load_device_lists()

    for client_id, devices in device_data.items():
        for i, device in enumerate(devices):
            if device["id"] == device_id:
                devices.pop(i)
                save_device_lists(device_data)
                logger.info("Admin deleted device: %s", device_id)
                return {"success": True, "message": f"Device {device_id} deleted successfully"}

    raise HTTPException(status_code=404, detail="Device not found")
