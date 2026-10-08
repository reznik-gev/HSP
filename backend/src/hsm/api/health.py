"""Health endpoints (docs/0057). Not exposed publicly by nginx (docs/0060)."""

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from hsm import __version__
from hsm.db import get_engine
from hsm.problems import ProblemException

router = APIRouter(tags=["health"])


class Health(BaseModel):
    status: str
    version: str


@router.get("/healthz")
async def healthz() -> Health:
    """The process is alive."""
    return Health(status="ok", version=__version__)


@router.get("/readyz")
async def readyz() -> Health:
    """The service can handle traffic: the database is reachable.

    TODO: also verify the Alembic schema revision and Keycloak reachability (docs/0056, 0057).
    """
    try:
        async with get_engine().connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as exc:
        raise ProblemException(503, "not-ready", "Database unreachable") from exc
    return Health(status="ready", version=__version__)
