"""Thin public Demo identity adapter over reusable, scoped Portal services."""

from datetime import datetime, timezone
import logging
import os
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse

from backend.app.services.portal_context import PortalIdentity, PortalScope, instant
from backend.app.services.portal_events import InvalidEventData
from backend.app.services.organisation_dashboard import EntityNotFound

router = APIRouter(prefix="/api/demo/portal")
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


@router.get("/context")
def context(request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"

    def operation():
        if request.query_params:
            raise ValueError("Context does not accept query parameters")
        return request.app.state.portal_metadata.load(demo_identity())[0]

    return read(operation)


EVENT_FILTERS = {"start", "end", "event", "sex", "age", "event_id"}


@router.get("/events")
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


@router.get("/events/export")
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


@router.get("/alarms")
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


@router.get("/reports/snapshot")
def report_snapshot(request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"

    def operation():
        from backend.app.services.local_data import (
            ensure_local_db_exists,
            snapshot_db_for_site,
        )
        from backend.app.snapshots import fetch_latest_snapshot_from_sqlite

        scope, _ = scope_and_filters(request, set())
        # The sole legacy Reports source mapping: never used by other modules.
        sources = {None: "all", "1": "site-a", "2": "site-b"}
        if scope.site_id not in sources:
            raise HTTPException(
                404, detail={"message": "Reports unavailable for this site"}
            )
        source = sources[scope.site_id]
        path = ensure_local_db_exists(
            snapshot_db_for_site(source), label="Reports snapshot"
        )
        clock = scope.identity.cutoff.astimezone(
            ZoneInfo(scope.identity.time_zone)
        ).replace(tzinfo=None)
        row = fetch_latest_snapshot_from_sqlite(path, org_id="client1", as_of=clock)
        if row is None:
            raise EntityNotFound()
        return dict(
            scope=scope.dto,
            ts=row.ts,
            payload=row.payload,
            mode="snapshots",
            fallback=False,
        )

    return read(operation)
