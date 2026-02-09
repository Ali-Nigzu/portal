"""Public demo session bootstrap."""

from __future__ import annotations

import logging
import os

from fastapi import APIRouter, Response

from backend.app.services.demo_session import DEMO_COOKIE_NAME

router = APIRouter(prefix="/api/demo")
logger = logging.getLogger(__name__)


@router.post("/session")
async def start_demo_session(response: Response) -> dict:
    response.set_cookie(
        key=DEMO_COOKIE_NAME,
        value="1",
        httponly=True,
        samesite="lax",
        secure=os.getenv("DEMO_SESSION_SECURE", "").lower() == "true",
        max_age=6 * 60 * 60,
        path="/",
    )
    logger.info("demo.session.started")
    return {"status": "ok"}


@router.post("/session/clear")
async def clear_demo_session(response: Response) -> dict:
    response.delete_cookie(key=DEMO_COOKIE_NAME, path="/")
    logger.info("demo.session.cleared")
    return {"status": "ok"}
