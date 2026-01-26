"""Client-accessible data endpoints (supports view tokens)."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Request

from backend.app.data.json_store import load_alarm_logs, load_device_lists, load_users
from backend.app.services.auth_context import resolve_client_from_request

router = APIRouter(prefix="/api")


@router.get("/alarm-logs")
async def get_alarm_logs(
    request: Request,
    view_token: Optional[str] = None,
    client_id: Optional[str] = None,
):
    """Get alarm logs for a client (supports view tokens and authenticated users)."""
    alarm_data = load_alarm_logs()
    target_client = resolve_client_from_request(
        request,
        view_token=view_token,
        client_id=client_id,
    )

    alarms = alarm_data.get(target_client, [])
    return {"alarms": alarms, "client_id": target_client}


@router.get("/device-list")
async def get_device_list(
    request: Request,
    view_token: Optional[str] = None,
    client_id: Optional[str] = None,
):
    """Get device list for a client (supports view tokens and authenticated users)."""
    device_data = load_device_lists()
    target_client = resolve_client_from_request(
        request,
        view_token=view_token,
        client_id=client_id,
    )

    devices = device_data.get(target_client, [])

    users = load_users()
    data_sources = []
    if target_client and target_client in users:
        data_sources = users[target_client].get("data_sources", [])

    return {"devices": devices, "client_id": target_client, "data_sources": data_sources}
