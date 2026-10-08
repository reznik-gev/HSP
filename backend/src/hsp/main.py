"""FastAPI application factory."""

from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

import structlog
import uuid_utils
from fastapi import FastAPI, Request, Response

from hsp import __version__
from hsp.api import health, v1
from hsp.auth.oidc import OidcClient
from hsp.config import get_settings
from hsp.db import dispose_engine
from hsp.logging import configure_logging
from hsp.problems import install_problem_handlers


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
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

    @app.middleware("http")
    async def request_id(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        rid = request.headers.get("X-Request-ID") or str(uuid_utils.uuid7())
        request.state.request_id = rid
        structlog.contextvars.bind_contextvars(request_id=rid)
        try:
            response = await call_next(request)
        finally:
            structlog.contextvars.clear_contextvars()
        response.headers["X-Request-ID"] = rid
        return response

    app.include_router(health.router)
    app.include_router(v1.router)
    return app


def run() -> None:
    import uvicorn

    uvicorn.run("hsp.main:create_app", factory=True, host="0.0.0.0", port=8000)
