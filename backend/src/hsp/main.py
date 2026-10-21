"""FastAPI application factory."""

import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

import structlog
import uuid_utils
from fastapi import FastAPI, Request, Response

from hsp import __version__, metrics
from hsp.api import auth, health, v1
from hsp.auth.oidc import OidcClient
from hsp.config import get_settings
from hsp.db import dispose_engine
from hsp.logging import configure_logging, is_debug
from hsp.problems import install_problem_handlers
from hsp.readiness import check_schema_at_startup, default_readiness
from hsp.tracing import configure_tracing

#: Probed every few seconds by health checks and Prometheus: left out of the request logs and the
#: request metrics, where they would drown the requests people make.
PROBE_PATHS = frozenset({"/healthz", "/readyz", "/metrics"})

#: Sign-in callbacks carry one-time codes in their query, so it's never logged; built from the
#: routers, so it follows their prefixes.
AUTH_PATH_PREFIX = v1.router.prefix + auth.router.prefix + "/"


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # The schema must match, or the API refuses to start, in every environment (docs/0056,
    # docs/0109).
    await check_schema_at_startup()
    yield
    await dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level, settings.log_json)

    app = FastAPI(
        title="HSP API",
        version=__version__,
        description="Human-Space Program: spaces, people and seats.",
        lifespan=lifespan,
    )
    install_problem_handlers(app)
    app.state.oidc = OidcClient(settings)
    app.state.readiness = default_readiness(settings.oidc_issuer_url)

    @app.middleware("http")
    async def identify_and_log_request(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        rid = request.headers.get("X-Request-ID") or str(uuid_utils.uuid7())
        request.state.request_id = rid
        structlog.contextvars.bind_contextvars(request_id=rid)
        started = time.perf_counter()
        status = 500  # unless the app answers
        try:
            response = await call_next(request)
            status = response.status_code
        finally:
            if request.url.path not in PROBE_PATHS:
                log_request(request, status, started, debug=is_debug(settings.log_level))
                record_metrics(request, status, started)
            structlog.contextvars.clear_contextvars()
        response.headers["X-Request-ID"] = rid
        return response

    app.include_router(health.router)
    app.include_router(v1.router)
    configure_tracing(app)
    return app


def log_request(request: Request, status: int, started: float, *, debug: bool) -> None:
    """The request's log line (docs/0105): the route template, never the raw path, which holds IDs
    and search text, except at debug level."""
    route = request.scope.get("route")
    fields = {
        "method": request.method,
        "route": getattr(route, "path", None),
        "status": status,
        "duration_ms": round((time.perf_counter() - started) * 1000),
        "request_id": request.state.request_id,
        "actor_subject": getattr(request.state, "actor_subject", None),
    }
    if debug:
        query = request.url.query if not request.url.path.startswith(AUTH_PATH_PREFIX) else ""
        fields["path"] = request.url.path + (f"?{query}" if query else "")
    structlog.get_logger().info("request", **fields)


def record_metrics(request: Request, status: int, started: float) -> None:
    route = request.scope.get("route")
    seconds = time.perf_counter() - started
    metrics.record_request(request.method, getattr(route, "path", None), status, seconds)
    if problem := getattr(request.state, "problem", None):
        metrics.record_problem(problem)
