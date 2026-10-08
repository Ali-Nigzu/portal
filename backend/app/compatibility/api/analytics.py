"""Retired legacy Event endpoint. Canonical Portal readers never fall back."""

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api")


@router.get("/search-events")
def search_events():
    raise HTTPException(
        410,
        detail={
            "error": "endpoint_retired",
            "message": "Use the scoped Portal Event endpoint.",
        },
    )
