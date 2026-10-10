"""Request selection for the retained positional snapshot/manifest contracts.

These paths never authenticate a customer or Admin session. View-token issuance
is absent from this application, so supplied tokens retain their existing error.
"""
from typing import Optional

from fastapi import HTTPException, Request

from backend.app.services.demo_session import resolve_demo_org_id


def resolve_view_token_context(view_token: str) -> str:
    raise HTTPException(status_code=401, detail="Invalid or expired view token")


def resolve_snapshot_org(*, request: Request, org_id: Optional[str], view_token: Optional[str]) -> str:
    explicit_org = org_id or request.query_params.get("org") or request.query_params.get("orgId")
    if explicit_org:
        return explicit_org

    resolved_view_token = view_token or request.query_params.get("viewToken") or request.query_params.get("view_token")
    if resolved_view_token:
        return resolve_view_token_context(resolved_view_token)

    demo_org = resolve_demo_org_id(request)
    if demo_org:
        return demo_org

    raise HTTPException(
        status_code=422,
        detail={"error": "missing_org", "message": "org or viewToken is required"},
    )
