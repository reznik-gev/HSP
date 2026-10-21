"""Health endpoints (docs/0057, docs/0105). Not exposed publicly by nginx (docs/0060)."""

from fastapi import APIRouter, Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from pydantic import BaseModel

from hsp import __version__, metrics
from hsp.problems import ProblemException
from hsp.readiness import Readiness

router = APIRouter(tags=["health"])


class Health(BaseModel):
    status: str
    version: str


@router.get("/healthz")
async def healthz() -> Health:
    """The process is alive."""
    return Health(status="ok", version=__version__)


@router.get("/metrics", include_in_schema=False)
async def metrics_endpoint() -> Response:
    """Prometheus metrics (docs/0105). The image serves them on their own port too (hsp/serve.py);
    nginx never routes here (docs/0060)."""
    return Response(generate_latest(metrics.registry()), media_type=CONTENT_TYPE_LATEST)


@router.get("/readyz")
async def readyz(request: Request) -> Health:
    """The service can handle traffic: the database answers, its schema is the one this version
    needs, and Keycloak answers. Otherwise 503, naming what failed."""
    readiness: Readiness = request.app.state.readiness
    problems = await readiness.problems()
    if problems:
        detail = "; ".join(f"{name}: {problem}" for name, problem in problems.items())
        raise ProblemException(503, "not-ready", "Not ready", detail)
    return Health(status="ready", version=__version__)
