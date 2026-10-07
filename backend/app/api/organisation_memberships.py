"""Session-authenticated canonical organisation and membership operations."""

import logging
from datetime import datetime
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StrictStr

from backend.app.auth import get_canonical_user
from backend.app.config import get_allowed_origins
from backend.app.services.organisation_memberships import MembershipError

logger = logging.getLogger(__name__)


class NoStoreRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def handle(request):
            try:
                response = await handler(request)
            except HTTPException as error:
                error.headers = {**(error.headers or {}), "Cache-Control": "no-store"}
                raise
            except RequestValidationError as error:
                response = await request_validation_exception_handler(request, error)
            response.headers["Cache-Control"] = "no-store"
            return response

        return handle


router = APIRouter(prefix="/api/portal", route_class=NoStoreRoute)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EmptyRequest(StrictModel):
    pass


class CreateOrganisation(StrictModel):
    name: StrictStr = Field(min_length=1, max_length=200)


class InviteMember(StrictModel):
    identifier_type: Literal["email", "username"]
    identifier: StrictStr = Field(min_length=1, max_length=320)


class Decision(StrictModel):
    expected_status_changed_at: AwareDatetime | None


class Organisation(StrictModel):
    id: str
    name: str


class CreatedOrganisation(Organisation):
    role: Literal[0]
    sites: list = Field(default_factory=list)


class Created(StrictModel):
    organisation: CreatedOrganisation


class Relationship(StrictModel):
    user_id: str
    organisation_id: str
    role: Literal[0, 1]
    status: Literal[0, 1, 2, 3]
    created_at: datetime
    status_changed_at: datetime | None


class MembershipResult(StrictModel):
    membership: Relationship


class PendingRelationship(Relationship):
    organisation_name: str


class Pending(StrictModel):
    invitations: list[PendingRelationship]
    requests: list[PendingRelationship]


class ManagedRelationship(Relationship):
    username: str
    email: str
    user_enabled: bool


class Access(StrictModel):
    organisation: Organisation
    actor_role: Literal[0, 1]
    can_manage: bool
    members: list[ManagedRelationship]
    invitations: list[ManagedRelationship]
    requests: list[ManagedRelationship]


class Resolved(StrictModel):
    organisation: Organisation
    relationship: Relationship | None
    can_request: bool


def mutation_origin(request: Request):
    # A custom header rules out cross-site HTML form submissions, including
    # requests without Origin. Browser JSON mutations also validate Origin.
    origin = request.headers.get("origin")
    allowed = set(get_allowed_origins()) | {str(request.base_url).rstrip("/")}
    if (
        request.headers.get("x-requested-with") != "camOS"
        or request.headers.get("sec-fetch-site") == "cross-site"
        or (origin is not None and origin not in allowed)
    ):
        raise HTTPException(
            403,
            detail={
                "error": "untrusted_origin",
                "message": "Request unavailable. Reload and try again.",
            },
        )


def operation(request, callback):
    try:
        service = getattr(request.app.state, "organisation_memberships", None)
        if service is None:
            raise RuntimeError("Canonical membership storage unavailable")
        return callback(service)
    except MembershipError as exc:
        raise HTTPException(
            exc.status, detail={"error": exc.code, "message": exc.message}
        ) from None
    except Exception as exc:
        request_id = uuid4().hex
        logger.warning(
            "memberships.unavailable request_id=%s type=%s",
            request_id,
            type(exc).__name__,
        )
        raise HTTPException(
            503,
            detail={
                "error": "storage_unavailable",
                "message": "Access service is temporarily unavailable. Please try again.",
                "request_id": request_id,
            },
        ) from None


mutations = [Depends(mutation_origin)]


@router.post(
    "/organisations", response_model=Created, status_code=201, dependencies=mutations
)
def create(
    payload: CreateOrganisation, request: Request, user=Depends(get_canonical_user)
):
    return operation(request, lambda service: service.create(user.id, payload.name))


@router.get("/me/memberships/pending", response_model=Pending)
def pending(request: Request, user=Depends(get_canonical_user)):
    return operation(request, lambda service: service.pending(user.id))


@router.get("/organisation-access/{organisation_id}", response_model=Resolved)
def resolve(organisation_id: str, request: Request, user=Depends(get_canonical_user)):
    return operation(request, lambda service: service.resolve(user.id, organisation_id))


@router.post(
    "/organisation-access/{organisation_id}/requests",
    response_model=MembershipResult,
    dependencies=mutations,
)
def request_access(
    organisation_id: str,
    payload: EmptyRequest,
    request: Request,
    response: Response,
    user=Depends(get_canonical_user),
):
    def call(service):
        membership, created = service.initiate(user.id, organisation_id)
        response.status_code = 201 if created else 200
        return {"membership": membership}

    return operation(request, call)


@router.get("/organisations/{organisation_id}/access", response_model=Access)
def access(organisation_id: str, request: Request, user=Depends(get_canonical_user)):
    return operation(request, lambda service: service.access(user.id, organisation_id))


@router.post(
    "/organisations/{organisation_id}/invitations",
    response_model=MembershipResult,
    dependencies=mutations,
)
def invite(
    organisation_id: str,
    payload: InviteMember,
    request: Request,
    response: Response,
    user=Depends(get_canonical_user),
):
    def call(service):
        membership, created = service.initiate(
            user.id,
            organisation_id,
            identifier_type=payload.identifier_type,
            identifier=payload.identifier,
        )
        response.status_code = 201 if created else 200
        return {"membership": membership}

    return operation(request, call)


def decide(request, user, organisation_id, payload, action, target=None):
    return operation(
        request,
        lambda service: {
            "membership": service.decide(
                user.id,
                organisation_id,
                action,
                payload.expected_status_changed_at,
                target,
            )
        },
    )


@router.post(
    "/me/invitations/{organisation_id}/accept",
    response_model=MembershipResult,
    dependencies=mutations,
)
def accept(
    organisation_id: str,
    payload: Decision,
    request: Request,
    user=Depends(get_canonical_user),
):
    return decide(request, user, organisation_id, payload, "accept")


@router.post(
    "/me/invitations/{organisation_id}/decline",
    response_model=MembershipResult,
    dependencies=mutations,
)
def decline_invitation(
    organisation_id: str,
    payload: Decision,
    request: Request,
    user=Depends(get_canonical_user),
):
    return decide(request, user, organisation_id, payload, "decline_invitation")


@router.post(
    "/organisations/{organisation_id}/invitations/{target}/withdraw",
    response_model=MembershipResult,
    dependencies=mutations,
)
def withdraw(
    organisation_id: str,
    target: str,
    payload: Decision,
    request: Request,
    user=Depends(get_canonical_user),
):
    return decide(request, user, organisation_id, payload, "withdraw", target)


@router.post(
    "/organisations/{organisation_id}/requests/{target}/approve",
    response_model=MembershipResult,
    dependencies=mutations,
)
def approve(
    organisation_id: str,
    target: str,
    payload: Decision,
    request: Request,
    user=Depends(get_canonical_user),
):
    return decide(request, user, organisation_id, payload, "approve", target)


@router.post(
    "/organisations/{organisation_id}/requests/{target}/decline",
    response_model=MembershipResult,
    dependencies=mutations,
)
def decline_request(
    organisation_id: str,
    target: str,
    payload: Decision,
    request: Request,
    user=Depends(get_canonical_user),
):
    return decide(request, user, organisation_id, payload, "decline_request", target)


@router.post(
    "/organisations/{organisation_id}/members/{target}/disable",
    response_model=MembershipResult,
    dependencies=mutations,
)
def disable(
    organisation_id: str,
    target: str,
    payload: Decision,
    request: Request,
    user=Depends(get_canonical_user),
):
    return decide(request, user, organisation_id, payload, "disable", target)
