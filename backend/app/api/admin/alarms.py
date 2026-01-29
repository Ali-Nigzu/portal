"""Admin alarm log endpoints."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException

from backend.app.auth import authenticate_user
from backend.app.data.json_store import load_alarm_logs, save_alarm_logs
from backend.app.models import CreateAlarmRequest, UpdateAlarmRequest

from .common import require_admin

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/alarm-logs")
async def create_alarm_log(
    create_request: CreateAlarmRequest,
    user: dict = Depends(authenticate_user),
):
    """Create a new alarm log (admin only)."""
    require_admin(user)

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

    logger.info(
        "Admin created alarm: %s for client: %s",
        new_alarm["id"],
        create_request.client_id,
    )
    return {"success": True, "alarm": new_alarm}


@router.put("/alarm-logs/{alarm_id}")
async def update_alarm_log(
    alarm_id: str,
    update_request: UpdateAlarmRequest,
    user: dict = Depends(authenticate_user),
):
    """Update an existing alarm log (admin only)."""
    require_admin(user)

    alarm_data = load_alarm_logs()

    for _client_id, alarms in alarm_data.items():
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
    require_admin(user)

    alarm_data = load_alarm_logs()

    for _client_id, alarms in alarm_data.items():
        for i, alarm in enumerate(alarms):
            if alarm["id"] == alarm_id:
                alarms.pop(i)
                save_alarm_logs(alarm_data)
                logger.info("Admin deleted alarm: %s", alarm_id)
                return {
                    "success": True,
                    "message": f"Alarm {alarm_id} deleted successfully",
                }

    raise HTTPException(status_code=404, detail="Alarm not found")
