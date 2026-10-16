"""Seat search ("where does X sit?") against PostgreSQL (docs/0085)."""

from typing import Any

from hsp.seats.search import SeatSearchService
from tests.db.seat_helpers import seated

FILTERS = ("q", "site_id", "building_id", "holder_person_id", "holder_unit_id", "status", "after")


async def test_where_does_x_sit(seat_floor: dict[str, Any]) -> None:
    who = await seated(seat_floor)
    search = SeatSearchService(seat_floor["db"], seat_floor["admin"])

    async def rows(**filters: Any) -> list[Any]:
        base: dict[str, Any] = dict.fromkeys(FILTERS) | {
            "floor_id": seat_floor["floor"],
            "limit": 50,
        }
        return await search.search(**(base | filters))

    async def ids(**filters: Any) -> set[Any]:
        return {r.id for r in await rows(**filters)}

    assert await ids() == {
        seat_floor["a"],
        seat_floor["b"],
        seat_floor["bookable"],
    }  # the draft-only seat isn't there
    assert await ids(q="maya") == {seat_floor["a"]}  # by person
    assert await ids(q="platform") == {seat_floor["a"]}  # by the holder's primary unit
    assert await ids(q="vision") == {seat_floor["b"]}  # by the holding unit
    label = next(r.label for r in await rows() if r.id == seat_floor["a"])
    assert label is not None and await ids(q=label) == {seat_floor["a"]}  # by seat label
    assert await ids(status="assigned") == {seat_floor["a"]}
    assert await ids(status="reserved") == {seat_floor["b"]}
    assert await ids(status="free") == set()  # the bookable seat isn't "free"
    assert await ids(holder_person_id=who["maya"]) == {seat_floor["a"]}

    row = (await rows(q="maya"))[0]
    assert row.holder_person is not None and row.holder_person.primary_unit is not None
    assert row.holder_person.primary_unit.name == "Platform"
    assert row.floor.id == seat_floor["floor"] and row.building.id == seat_floor["building"]
