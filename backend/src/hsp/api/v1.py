"""The /api/v1 router (docs/0035). Feature routers are included here."""

from fastapi import APIRouter

from hsp.api import auth

router = APIRouter(prefix="/api/v1")
router.include_router(auth.router)
