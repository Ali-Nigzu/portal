"""Session-authenticated, membership-scoped Portal API."""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, StrictBool

from backend.app.auth import get_canonical_user
from backend.app.api.portal import EVENT_FILTERS, read
from backend.app.services.organisation_dashboard import EntityNotFound, entity_id
from backend.app.services.portal_context import PortalIdentity, PortalScope
from backend.app.services.portal_devices import SourceNotFound

router = APIRouter(prefix="/api/portal")


class SetEnabledRequest(BaseModel):
    enabled: StrictBool
    model_config = ConfigDict(extra="forbid")


def organisation_id(value: str) -> int:
    try:
        return int(entity_id(value))
    except ValueError:
        raise HTTPException(404, detail={"error": "not_found", "message": "Scope unavailable."}) from None


def authorised_identity(request: Request, user, value: str):
    oid = organisation_id(value)
    membership = request.app.state.auth_repository.enabled_membership(user.id, oid)
    if membership is None:
        raise HTTPException(404, detail={"error": "not_found", "message": "Scope unavailable."})
    return PortalIdentity(oid, None, "Europe/London"), membership


def scope_and_filters(request, user, organisation, allowed):
    params = request.query_params
    if set(params) - set(allowed) - {"site_id", "source"}:
        raise ValueError("Unsupported query parameter")
    for name in params:
        if name != "source" and len(params.getlist(name)) != 1:
            raise ValueError("Repeated query parameter")
    if len(params.getlist("source")) > 100:
        raise ValueError("Too many source filters")
    identity, _ = authorised_identity(request, user, organisation)
    scope = PortalScope.resolve(
        identity, request.app.state.portal_metadata,
        params.get("site_id"), params.getlist("source"),
    )
    return scope, {
        key: params[key] for key in allowed
        if key in params and key not in {"cursor", "page_size"}
    }


@router.get("/organisations")
def organisations(request: Request, user=Depends(get_canonical_user)):
    return {"organisations": request.app.state.auth_repository.organisations(user.id)}


@router.get("/organisations/{organisation}/context")
def context(organisation: str, request: Request, response: Response, user=Depends(get_canonical_user)):
    response.headers["Cache-Control"] = "no-store"
    def operation():
        identity, membership = authorised_identity(request, user, organisation)
        result = request.app.state.portal_metadata.load(identity)[0]
        result["membership"] = {"role": membership.role}
        return result
    return read(operation)


@router.get("/organisations/{organisation}/snapshot")
def organisation_snapshot(organisation: str, request: Request, user=Depends(get_canonical_user)):
    def operation():
        identity, _ = authorised_identity(request, user, organisation)
        return request.app.state.organisation_dashboard.load_organisation_snapshot(identity.organisation_id)
    return read(operation)


@router.get("/organisations/{organisation}/sites/{site}/snapshot")
def site_snapshot(organisation: str, site: str, request: Request, user=Depends(get_canonical_user)):
    def operation():
        identity, _ = authorised_identity(request, user, organisation)
        resolved = PortalScope.resolve(identity, request.app.state.portal_metadata, site)
        return request.app.state.organisation_dashboard.load_site_snapshot(
            identity.organisation_id, int(resolved.site_id)
        )
    return read(operation)


@router.get("/organisations/{organisation}/devices")
def devices(organisation: str, request: Request, response: Response, user=Depends(get_canonical_user)):
    response.headers["Cache-Control"] = "no-store"
    return read(lambda: request.app.state.portal_devices.read(
        scope_and_filters(request, user, organisation, set())[0]
    ))


@router.get("/organisations/{organisation}/events")
def events(organisation: str, request: Request, response: Response, user=Depends(get_canonical_user)):
    response.headers["Cache-Control"] = "no-store"
    def operation():
        scope, filters = scope_and_filters(request, user, organisation, EVENT_FILTERS | {"cursor", "page_size"})
        return request.app.state.portal_events.search(
            scope, filters, cursor=request.query_params.get("cursor"),
            page_size=int(request.query_params.get("page_size", "20")),
        )
    return read(operation)


@router.get("/organisations/{organisation}/events/export")
def export_events(organisation: str, request: Request, user=Depends(get_canonical_user)):
    def operation():
        scope, filters = scope_and_filters(request, user, organisation, EVENT_FILTERS)
        return StreamingResponse(
            request.app.state.portal_events.export(scope, filters), media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="events.csv"', "Cache-Control": "no-store"},
        )
    return read(operation)


@router.get("/organisations/{organisation}/alarms")
def alarms(organisation: str, request: Request, response: Response, user=Depends(get_canonical_user)):
    response.headers["Cache-Control"] = "no-store"
    def operation():
        scope, filters = scope_and_filters(request, user, organisation, {"start", "end", "severity", "cursor"})
        return request.app.state.portal_alarms.search(scope, filters, request.query_params.get("cursor"))
    return read(operation)


@router.get("/organisations/{organisation}/reports/snapshot")
def reports(organisation: str, request: Request, response: Response, user=Depends(get_canonical_user)):
    response.headers["Cache-Control"] = "no-store"
    return read(lambda: request.app.state.portal_reports.read_snapshot(
        scope_and_filters(request, user, organisation, set())[0]
    ))


@router.put("/organisations/{organisation}/devices/{device}/enabled")
def set_device_enabled(organisation: str, device: str, payload: SetEnabledRequest, request: Request, user=Depends(get_canonical_user)):
    def operation():
        identity, _ = authorised_identity(request, user, organisation)
        scope = PortalScope.resolve(identity, request.app.state.portal_metadata)
        try:
            return request.app.state.portal_devices.set_device_enabled(scope, device, payload.enabled)
        except SourceNotFound:
            raise EntityNotFound() from None
    return read(operation)


@router.put("/organisations/{organisation}/gateways/by-site/{site}/enabled")
def set_gateway_enabled(organisation: str, site: str, payload: SetEnabledRequest, request: Request, user=Depends(get_canonical_user)):
    def operation():
        identity, _ = authorised_identity(request, user, organisation)
        scope = PortalScope.resolve(identity, request.app.state.portal_metadata, site)
        try:
            return request.app.state.portal_devices.set_gateway_enabled(scope, site, payload.enabled)
        except SourceNotFound:
            raise EntityNotFound() from None
    return read(operation)
