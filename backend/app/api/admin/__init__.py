"""Admin-only endpoints."""

from fastapi import APIRouter

from .alarms import router as alarms_router
from .data_sources import router as data_sources_router
from .devices import router as devices_router
from .users import router as users_router

router = APIRouter(prefix="/api/admin")

router.include_router(users_router)
router.include_router(devices_router)
router.include_router(alarms_router)
router.include_router(data_sources_router)
