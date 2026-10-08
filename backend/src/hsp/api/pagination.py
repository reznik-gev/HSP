"""Cursor pagination (docs/0040).

Responses are `{"items": [...], "next_cursor": "..." | null}`. Cursors are opaque URL-safe
base64 of the last item's id plus a fingerprint of the filters; reusing a cursor with different
filters is a 400. Items are ordered by id (UUIDv7, roughly creation time).
"""

import base64
import hashlib
import json
import uuid
from typing import Annotated, Any

from fastapi import Query
from pydantic import BaseModel

from hsp.problems import ProblemException

DEFAULT_LIMIT = 50
MAX_LIMIT = 500

LimitParam = Annotated[int, Query(ge=1, le=MAX_LIMIT, description="Page size")]
CursorParam = Annotated[str | None, Query(description="`next_cursor` from the previous page")]


class Page[T](BaseModel):
    items: list[T]
    next_cursor: str | None


def _fingerprint(filters: dict[str, Any]) -> str:
    digest = hashlib.sha256(json.dumps(filters, sort_keys=True, default=str).encode())
    return digest.hexdigest()[:16]


def encode_cursor(after: uuid.UUID, filters: dict[str, Any]) -> str:
    raw = json.dumps({"after": str(after), "f": _fingerprint(filters)}).encode()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def decode_cursor(cursor: str | None, filters: dict[str, Any]) -> uuid.UUID | None:
    if cursor is None:
        return None
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded))
        after = uuid.UUID(data["after"])
        matches = data["f"] == _fingerprint(filters)
    except (ValueError, KeyError, TypeError):
        raise ProblemException(400, "cursor-invalid", "Invalid cursor") from None
    if not matches:
        raise ProblemException(
            400, "cursor-invalid", "Invalid cursor", "The cursor was issued for different filters."
        )
    return after


def page_of[T](rows: list[Any], limit: int, filters: dict[str, Any], to_item: Any) -> Page[T]:
    """`rows` must hold up to limit + 1 items; the extra one only signals a next page."""
    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = encode_cursor(rows[-1].id, filters) if has_more and rows else None
    return Page[T](items=[to_item(r) for r in rows], next_cursor=next_cursor)
