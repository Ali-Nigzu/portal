"""SPA static file serving helpers."""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

logger = logging.getLogger(__name__)


def configure_spa(app: FastAPI) -> None:
    static_dir = os.path.join("backend", "frontend_build", "static")
    if os.path.isdir(static_dir):
        app.mount("/static", StaticFiles(directory=static_dir), name="static")
    else:
        logger.warning("Static assets directory not found: %s", static_dir)

    @app.get("/")
    async def serve_index():
        index_path = os.path.join("backend/frontend_build", "index.html")
        if not os.path.exists(index_path):
            raise HTTPException(status_code=500, detail="index.html not found")
        return FileResponse(index_path)

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api") or full_path.startswith("static"):
            raise HTTPException(status_code=404, detail="API or static route not found")
        index_path = os.path.join("backend/frontend_build", "index.html")
        if not os.path.exists(index_path):
            raise HTTPException(status_code=500, detail="index.html not found")
        return FileResponse(index_path)
