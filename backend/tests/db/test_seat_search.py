"""Seat search ("where does X sit?") against PostgreSQL (docs/0085)."""

from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncConnection

from hsp.seats.search import SeatSearchService
from tests.db.seat_helpers import published_seats, seated


@pytest.fixture
async def ctx(conn: AsyncConnection) -> dict[str, Any]:
    return await published_seats(conn)


FILTERS = ("q", "site_id", "building_id", "holder_person_id", "holder_unit_id", "status", "after")


async def test_where_does_x_sit(ctx: dict[str, Any]) -> None:
    who = await seated(ctx)
    search = SeatSearchService(ctx["db"], ctx["admin"])

    async def rows(**filters: Any) -> list[Any]:
        base: dict[str, Any] = dict.fromkeys(FILTERS) | {"floor_id": ctx["floor"], "limit": 50}
        return await search.search(**(base | filters))

    async def ids(**filters: Any) -> set[Any]:
        return {r.id for r in await rows(**filters)}

    assert await ids() == {ctx["a"], ctx["b"], ctx["bookable"]}  # the draft-only seat isn't there
    assert await ids(q="maya") == {ctx["a"]}  # by person
    assert await ids(q="platform") == {ctx["a"]}  # by the holder's primary unit
    assert await ids(q="vision") == {ctx["b"]}  # by the holding unit
    label = next(r.label for r in await rows() if r.id == ctx["a"])
    assert label is not None and await ids(q=label) == {ctx["a"]}  # by seat label
    assert await ids(status="assigned") == {ctx["a"]}
    assert await ids(status="reserved") == {ctx["b"]}
    assert await ids(status="free") == set()  # the bookable seat isn't "free"
    assert await ids(holder_person_id=who["maya"]) == {ctx["a"]}

    row = (await rows(q="maya"))[0]
    assert row.holder_person is not None and row.holder_person.primary_unit is not None
    assert row.holder_person.primary_unit.name == "Platform"
    assert row.floor.id == ctx["floor"] and row.building.id == ctx["building"]
