"""The /api/v1 router (docs/0035). Feature routers are included here."""

from fastapi import APIRouter

from hsp.api import (
    auth,
    buildings,
    catalog,
    devices,
    drafts,
    floors,
    locks,
    org_units,
    plans,
    sites,
)

router = APIRouter(prefix="/api/v1")
router.include_router(auth.router)
router.include_router(sites.router)
router.include_router(buildings.router)
router.include_router(floors.router)
router.include_router(plans.router)
router.include_router(locks.router)
router.include_router(drafts.router)
router.include_router(catalog.router)
router.include_router(devices.router)
router.include_router(org_units.router)
