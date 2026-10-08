"""The /api/v1 router (docs/0035). Feature routers are included here."""

from fastapi import APIRouter

from hsp.api import auth, sites

router = APIRouter(prefix="/api/v1")
router.include_router(auth.router)
router.include_router(sites.router)
