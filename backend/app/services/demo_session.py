"""Demo session helpers."""

from __future__ import annotations

from typing import Optional

from fastapi import Request

DEMO_COOKIE_NAME = "demo_session"
DEMO_HEADER_NAME = "X-Demo-Session"
DEMO_ORG_ID = "client1"


def resolve_demo_org_id(request: Request) -> Optional[str]:
    cookie_value = request.cookies.get(DEMO_COOKIE_NAME)
    header_value = request.headers.get(DEMO_HEADER_NAME)
    if cookie_value == "1" or header_value == "1":
        return DEMO_ORG_ID
    return None
