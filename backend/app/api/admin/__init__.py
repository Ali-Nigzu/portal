"""Canonical PostgreSQL Admin; no legacy authority or schema operations."""

import json
import logging
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from backend.app.api.organisation_memberships import NoStoreRoute, mutation_origin
from backend.app.services.admin_auth import (
    admin_user,
    create_admin_session,
    set_admin_cookie,
    clear_admin_cookie,
    ADMIN_ID,
)
from backend.app.services.admin_registry import AdminError, registry, json_text
from backend.app.services import passwords

router = APIRouter(prefix="/api/admin", route_class=NoStoreRoute)
logger = logging.getLogger(__name__)
mutations = [Depends(mutation_origin)]


def result(operation):
    try:
        return operation()
    except AdminError as error:
        raise HTTPException(error.status, error.message) from None
    except Exception:
        logger.warning("admin.storage_unavailable")
        raise HTTPException(503, "Admin database temporarily unavailable") from None


def repository(request):
    repo = getattr(request.app.state, "admin_repository", None)
    if repo is None:
        raise HTTPException(
            503, "Canonical Admin database unavailable in this environment"
        )
    return repo


async def body(request):
    # Bounded body and lossless JSON number parsing, including JSONB numerics.
    payload = bytearray()
    async for part in request.stream():
        payload.extend(part)
        if len(payload) > 2 * 1024 * 1024:
            raise HTTPException(413, "Admin request too large")

    def pairs(items):
        value = {}
        for k, v in items:
            if k in value:
                raise ValueError("Duplicate JSON key")
            value[k] = v
        return value

    try:
        value = json.loads(
            payload,
            parse_float=Decimal,
            parse_constant=lambda _: (_ for _ in ()).throw(ValueError()),
            object_pairs_hook=pairs,
        )
        if type(value) is not dict:
            raise ValueError()
        return value
    except (ValueError, UnicodeDecodeError, RecursionError):
        raise HTTPException(422, "Expected valid JSON object") from None


def exact(value, fields, optional=()):
    if not set(fields) <= set(value) or set(value) - set(fields) - set(optional):
        raise HTTPException(422, "Unexpected or missing request fields")


def response(value, status=200):
    return Response(
        json_text(value),
        status_code=status,
        media_type="application/json",
        headers={"Cache-Control": "no-store"},
    )


@router.post("/login", dependencies=mutations)
async def login(request: Request, response: Response):
    value = await body(request)
    exact(value, ("username", "password"))
    if (
        type(value["username"]) is not str
        or type(value["password"]) is not str
        or not 1 <= len(value["username"]) <= 320
        or not 1 <= len(value["password"]) <= 1024
    ):
        raise HTTPException(422, "Username and password required")
    # Offload canonical Argon2 and synchronous repository calls.
    from starlette.concurrency import run_in_threadpool

    def authenticate():
        user = request.app.state.auth_repository.find_username(
            value["username"].strip()
        )
        if (
            user is None
            or user.id != ADMIN_ID
            or user.status != 1
            or not passwords.verify_password(value["password"], user.password_hash)
        ):
            raise HTTPException(401, "Invalid username or password")
        token, expires = create_admin_session(user.id, user.session_version)
        return user, token, expires

    try:
        user, token, expires = await run_in_threadpool(authenticate)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            503, "Admin authentication temporarily unavailable"
        ) from None
    set_admin_cookie(response, token, expires)
    return {"user": {"id": str(user.id), "username": user.username}}


@router.get("/me")
def me(user=Depends(admin_user)):
    return {"user": {"id": str(user.id), "username": user.username}}


@router.post("/logout", status_code=204, dependencies=mutations)
def logout(response: Response):
    # Remains available after expiry, clears only Admin cookie.
    clear_admin_cookie(response)


@router.get("/tables")
def tables(user=Depends(admin_user)):
    return {"tables": registry()}


def query(request, allowed):
    params = request.query_params
    if set(params) - set(allowed) or any(len(params.getlist(n)) != 1 for n in params):
        raise HTTPException(422, "Unsupported query parameter")
    return dict(params)


@router.get("/tables/{name}/rows")
def rows(name: str, request: Request, user=Depends(admin_user)):
    from backend.app.services.admin_registry import table

    t = result(lambda: table(name))
    q = query(request, ("page_size", "cursor", *t.filters))
    try:
        size = int(q.pop("page_size", "50"))
    except ValueError:
        raise HTTPException(422, "Invalid page size") from None
    cursor = q.pop("cursor", None)
    for n in q:
        if t.fields[n].type == "smallint":
            try:
                q[n] = int(q[n])
            except ValueError:
                raise HTTPException(422, "Invalid filter") from None
    return response(result(lambda: repository(request).list(name, size, cursor, q)))


@router.get("/tables/{name}/row")
def read_row(name: str, request: Request, user=Depends(admin_user)):
    from backend.app.services.admin_registry import table

    t = result(lambda: table(name))
    key = query(request, t.pk)
    return response(result(lambda: repository(request).get(name, key)))


@router.post("/tables/{name}/rows", dependencies=mutations)
async def create(name: str, request: Request, user=Depends(admin_user)):
    value = await body(request)
    exact(value, ("values",), ("server_now",))
    from starlette.concurrency import run_in_threadpool

    return response(
        await run_in_threadpool(
            result,
            lambda: repository(request).mutate(
                name, value["values"], server_now=value.get("server_now", [])
            ),
        ),
        201,
    )


@router.put("/tables/{name}/row", dependencies=mutations)
async def update(name: str, request: Request, user=Depends(admin_user)):
    value = await body(request)
    exact(value, ("key", "changes"), ("server_now",))
    from starlette.concurrency import run_in_threadpool

    return response(
        await run_in_threadpool(
            result,
            lambda: repository(request).mutate(
                name,
                value["changes"],
                value["key"],
                server_now=value.get("server_now", []),
            ),
        )
    )


@router.get("/organisations/{oid}/context")
def context(oid: str, request: Request, user=Depends(admin_user)):
    q = query(request, ("page_size", "cursor", "membership_cursor"))
    try:
        size = int(q.get("page_size", "50"))
    except ValueError:
        raise HTTPException(422, "Invalid page size") from None
    return response(
        result(
            lambda: repository(request).context(
                oid, size, q.get("cursor"), q.get("membership_cursor")
            )
        )
    )
