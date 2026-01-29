"""Admin device endpoints."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException

from backend.app.auth import authenticate_user
from backend.app.data.json_store import load_device_lists, save_device_lists
from backend.app.models import CreateDeviceRequest, UpdateDeviceRequest

from .common import require_admin

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/device-list")
async def create_device(
    create_request: CreateDeviceRequest,
    user: dict = Depends(authenticate_user),
):
    """Create a new device (admin only)."""
    require_admin(user)

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

    logger.info(
        "Admin created device: %s for client: %s",
        new_device["id"],
        create_request.client_id,
    )
    return {"success": True, "device": new_device}


@router.put("/device-list/{device_id}")
async def update_device(
    device_id: str,
    update_request: UpdateDeviceRequest,
    user: dict = Depends(authenticate_user),
):
    """Update an existing device (admin only)."""
    require_admin(user)

    device_data = load_device_lists()

    for _client_id, devices in device_data.items():
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
    require_admin(user)

    device_data = load_device_lists()

    for _client_id, devices in device_data.items():
        for i, device in enumerate(devices):
            if device["id"] == device_id:
                devices.pop(i)
                save_device_lists(device_data)
                logger.info("Admin deleted device: %s", device_id)
                return {
                    "success": True,
                    "message": f"Device {device_id} deleted successfully",
                }

    raise HTTPException(status_code=404, detail="Device not found")
