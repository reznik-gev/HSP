"""HTTP caching for what the app polls (docs/0041, docs/0104).

Polled reads carry a weak ETag, a hash of the body, and `Cache-Control: private, no-cache`: the
browser keeps the answer and asks again with If-None-Match, and an unchanged answer is a 304
with no body. The server still does the work; what's saved is the download and the redraw.
A published plan version never changes, so the browser keeps it for good instead.
"""

import hashlib
from collections.abc import AsyncIterable

from fastapi import Request, Response

from hsp.api.routes import route_template

#: Route templates the app polls (docs/0041): the floor, its edit lock, and its seats.
POLLED = frozenset(
    {
        "/api/v1/floors/{floor_id}",
        "/api/v1/floors/{floor_id}/lock",
        "/api/v1/seats",
    }
)
REVALIDATE = "private, no-cache"

#: Route templates whose answers never change.
IMMUTABLE = frozenset({"/api/v1/floors/{floor_id}/versions/{version}"})
FOREVER = "private, max-age=31536000, immutable"


def etag_of(body: bytes) -> str:
    return f'W/"{hashlib.sha256(body).hexdigest()[:32]}"'


def matches(if_none_match: str, etag: str) -> bool:
    """Weak comparison against each tag in an If-None-Match list."""
    opaque = etag.removeprefix("W/")
    return any(tag.strip().removeprefix("W/") == opaque for tag in if_none_match.split(","))


async def apply_caching(request: Request, response: Response) -> Response:
    """Add the caching headers to a successful GET of a polled or never-changing route, and
    answer 304 when the browser already has the same answer."""
    if request.method != "GET" or response.status_code != 200:
        return response
    route = route_template(request)
    if route in IMMUTABLE:
        response.headers["Cache-Control"] = FOREVER
        return response
    if route not in POLLED:
        return response

    # The middleware hands over a streamed body; read it to hash it.
    chunks: AsyncIterable[bytes] = getattr(response, "body_iterator")  # noqa: B009
    body = b"".join([chunk async for chunk in chunks])
    etag = etag_of(body)
    headers = {"ETag": etag, "Cache-Control": REVALIDATE}
    if matches(request.headers.get("If-None-Match", ""), etag):
        return Response(status_code=304, headers=headers)
    full = Response(body, status_code=200, headers=dict(response.headers))
    full.headers.update(headers)
    return full
