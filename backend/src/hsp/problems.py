"""RFC 9457 Problem Details responses (docs/0037)."""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

PROBLEM_JSON = "application/problem+json"
PROBLEM_BASE = "https://hsp.example/problems/"


class ProblemError(BaseModel):
    code: str
    message: str
    pointer: str | None = None
    op_index: int | None = None
    element_id: str | None = None
    related_ids: list[str] | None = None


class Problem(BaseModel):
    type: str
    title: str
    status: int
    detail: str | None = None
    instance: str | None = None
    request_id: str | None = None
    errors: list[ProblemError] | None = None


class ProblemException(Exception):
    """Raise from services/routers to return a Problem Details response."""

    def __init__(
        self,
        status: int,
        slug: str,
        title: str,
        detail: str | None = None,
        errors: list[ProblemError] | None = None,
    ) -> None:
        super().__init__(title)
        self.status = status
        self.slug = slug
        self.title = title
        self.detail = detail
        self.errors = errors


def _response(request: Request, problem: Problem) -> JSONResponse:
    problem.instance = request.url.path
    problem.request_id = getattr(request.state, "request_id", None)
    return JSONResponse(
        problem.model_dump(exclude_none=True), status_code=problem.status, media_type=PROBLEM_JSON
    )


def _pointer(loc: tuple[Any, ...]) -> str:
    # Drop the leading location kind ("body", "query", ...) and build a JSON Pointer.
    parts = [str(p).replace("~", "~0").replace("/", "~1") for p in loc[1:]]
    return "/" + "/".join(parts)


def install_problem_handlers(app: FastAPI) -> None:
    @app.exception_handler(ProblemException)
    async def _problem(request: Request, exc: ProblemException) -> JSONResponse:
        return _response(
            request,
            Problem(
                type=PROBLEM_BASE + exc.slug,
                title=exc.title,
                status=exc.status,
                detail=exc.detail,
                errors=exc.errors,
            ),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            ProblemError(code=str(e["type"]), message=str(e["msg"]), pointer=_pointer(e["loc"]))
            for e in exc.errors()
        ]
        return _response(
            request,
            Problem(
                type=PROBLEM_BASE + "request-invalid",
                title="Request validation failed",
                status=422,
                errors=errors,
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return _response(
            request,
            Problem(
                type="about:blank",
                title=str(exc.detail),
                status=exc.status_code,
            ),
        )
