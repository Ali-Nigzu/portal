"""Public, read-only dashboard wrapper. No request can supply an organisation."""

import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from backend.app.services.organisation_dashboard import (
    EntityNotFound, InvalidSnapshot, entity_id,
)

router = APIRouter(prefix="/api/demo/dashboard")
logger = logging.getLogger(__name__)
DEMO_ORGANISATION_ID = 1


def service(request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"
    if request.query_params:
        raise HTTPException(422, detail={"error": "invalid_parameters", "message": "Dashboard query parameters are not supported."})
    return request.app.state.organisation_dashboard


def read(operation):
    try:
        return operation()
    except EntityNotFound:
        raise HTTPException(404, detail={"error": "not_found", "message": "Dashboard data not found."}) from None
    except InvalidSnapshot:
        raise HTTPException(502, detail={"error": "invalid_snapshot", "message": "Snapshot data is invalid."}) from None
    except Exception as exc:
        request_id = uuid4().hex
        # Do not log exception text/tracebacks: connector errors may contain key paths.
        logger.warning("demo.dashboard.storage_unavailable request_id=%s type=%s", request_id, type(exc).__name__)
        raise HTTPException(503, detail={"error": "dashboard_unavailable", "message": "Dashboard storage is unavailable.", "request_id": request_id}) from None


@router.get("/context")
def context(reader=Depends(service)):
    return read(lambda: reader.load_organisation_context(DEMO_ORGANISATION_ID))


@router.get("/snapshot")
def organisation_snapshot(reader=Depends(service)):
    return read(lambda: reader.load_organisation_snapshot(DEMO_ORGANISATION_ID))


@router.get("/sites/{site_id}/snapshot")
def site_snapshot(site_id: str, reader=Depends(service)):
    try:
        selected_id = int(entity_id(site_id))
    except ValueError:
        raise HTTPException(422, detail={"error": "invalid_site", "message": "Invalid site identifier."}) from None
    return read(lambda: reader.load_site_snapshot(DEMO_ORGANISATION_ID, selected_id))
