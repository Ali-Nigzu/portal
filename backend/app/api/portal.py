"""Thin public Demo identity adapter over reusable, scoped Portal services."""

from datetime import datetime, timezone
import logging
import os
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse

from backend.app.services.portal_context import PortalIdentity, PortalScope, instant
from backend.app.services.portal_events import InvalidEventData
from backend.app.services.organisation_dashboard import EntityNotFound, InvalidSnapshot, entity_id
from backend.app.services.portal_reports import (
    InvalidReportSnapshot,
    ReportSnapshotNotFound,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def demo_identity():
    now = datetime.now(timezone.utc)
    configured = os.getenv("PORTAL_DEMO_NOW")
    return PortalIdentity(
        1,
        instant(configured) if configured else now,
        os.getenv("DEMO_NOW_TIMEZONE", "Europe/London"),
    )


def read(operation):
    try:
        return operation()
    except HTTPException:
        raise
    except EntityNotFound:
        raise HTTPException(
            404,
            detail={
                "error": "not_found",
                "message": "Entity unavailable in this scope.",
            },
        ) from None
    except ReportSnapshotNotFound:
        raise HTTPException(
            404,
            detail={
                "error": "report_snapshot_not_found",
                "message": "No report snapshot is available for this scope.",
            },
        ) from None
    except InvalidReportSnapshot:
        raise HTTPException(
            502,
            detail={
                "error": "invalid_snapshot",
                "message": "Report snapshot data is invalid.",
            },
        ) from None
    except ValueError as exc:
        # Never echo a driver/library ValueError (it may contain connection data).
        message = "Invalid filters or continuation. Check the selection and date range."
        if str(exc) in {
            "Export exceeds 100,000 rows. Narrow the filters.",
            "More than 1,000 active alarms. Narrow the filters.",
        }:
            message = str(exc)
        raise HTTPException(
            422, detail={"error": "invalid_parameters", "message": message}
        ) from None
    except InvalidEventData:
        raise HTTPException(
            502,
            detail={
                "error": "invalid_events",
                "message": "Event data cannot be paginated safely.",
            },
        ) from None
    except Exception as exc:
        request_id = uuid4().hex
        logger.warning(
            "portal.unavailable request_id=%s type=%s", request_id, type(exc).__name__
        )
        raise HTTPException(
            503,
            detail={
                "error": "source_unavailable",
                "message": "Data source unavailable. Please retry.",
                "request_id": request_id,
            },
        ) from None


def scope_and_filters(request, allowed):
    params = request.query_params
    if set(params) - set(allowed) - {"site_id", "source", "effective_now"}:
        raise ValueError("Unsupported query parameter")
    for name in params:
        if name != "source" and len(params.getlist(name)) != 1:
            raise ValueError("Repeated query parameter")
    if len(params.getlist("source")) > 100:
        raise ValueError("Too many source filters")
    identity = demo_identity()
    if params.get("effective_now"):
        requested = instant(params["effective_now"])
        if requested > identity.cutoff:
            raise ValueError("Effective time exceeds the permitted present")
        identity = PortalIdentity(
            identity.organisation_id, requested, identity.time_zone
        )
    scope = PortalScope.resolve(
        identity,
        request.app.state.portal_metadata,
        params.get("site_id"),
        params.getlist("source"),
    )
    return scope, {
        key: params[key]
        for key in allowed
        if key in params and key not in {"cursor", "page_size"}
    }


@router.get("/api/demo/portal/context")
def context(request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"

    def operation():
        if request.query_params:
            raise ValueError("Context does not accept query parameters")
        return request.app.state.portal_metadata.load(demo_identity())[0]

    return read(operation)


@router.get("/api/demo/portal/devices")
def devices(request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"

    def operation():
        scope, _ = scope_and_filters(request, set())
        return request.app.state.portal_devices.read(scope)

    return read(operation)


EVENT_FILTERS = {"start", "end", "event", "sex", "age", "event_id"}


@router.get("/api/demo/portal/events")
def events(request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"

    def operation():
        scope, filters = scope_and_filters(
            request, EVENT_FILTERS | {"cursor", "page_size"}
        )
        return request.app.state.portal_events.search(
            scope,
            filters,
            cursor=request.query_params.get("cursor"),
            page_size=int(request.query_params.get("page_size", "20")),
        )

    return read(operation)


@router.get("/api/demo/portal/events/export")
def export_events(request: Request):
    def operation():
        scope, filters = scope_and_filters(request, EVENT_FILTERS)
        chunks = request.app.state.portal_events.export(scope, filters)
        return StreamingResponse(
            chunks,
            media_type="text/csv",
            headers={
                "Content-Disposition": 'attachment; filename="events.csv"',
                "Cache-Control": "no-store",
            },
        )

    return read(operation)


@router.get("/api/demo/portal/alarms")
def alarms(request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"

    def operation():
        scope, filters = scope_and_filters(
            request, {"start", "end", "severity", "cursor"}
        )
        return request.app.state.portal_alarms.search(
            scope, filters, request.query_params.get("cursor")
        )

    return read(operation)


@router.get("/api/demo/portal/reports/snapshot")
def report_snapshot(request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"

    def operation():
        scope, _ = scope_and_filters(request, set())
        return request.app.state.portal_reports.read_snapshot(scope)

    return read(operation)


DEMO_ORGANISATION_ID = 1


def dashboard_reader(request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"
    if request.query_params:
        raise HTTPException(422, detail={"error": "invalid_parameters", "message": "Dashboard query parameters are not supported."})
    return request.app.state.organisation_dashboard


def read_dashboard(operation):
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


@router.get("/api/demo/dashboard/snapshot")
def demo_organisation_snapshot(reader=Depends(dashboard_reader)):
    return read_dashboard(lambda: reader.load_organisation_snapshot(DEMO_ORGANISATION_ID))


@router.get("/api/demo/dashboard/sites/{site_id}/snapshot")
def demo_site_snapshot(site_id: str, reader=Depends(dashboard_reader)):
    try:
        selected_id = int(entity_id(site_id))
    except ValueError:
        raise HTTPException(422, detail={"error": "invalid_site", "message": "Invalid site identifier."}) from None
    return read_dashboard(lambda: reader.load_site_snapshot(DEMO_ORGANISATION_ID, selected_id))
