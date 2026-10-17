"""Seat search ("where does X sit?") against PostgreSQL (docs/0085)."""

from typing import Any

from hsp.seats.search import SeatSearchService
from tests.db.seat_helpers import seated

FILTERS = ("q", "site_id", "building_id", "holder_person_id", "holder_unit_id", "status", "after")


async def test_where_does_x_sit(published_floor_with_seats: dict[str, Any]) -> None:
    who = await seated(published_floor_with_seats)
    search = SeatSearchService(
        published_floor_with_seats["db"], published_floor_with_seats["admin"]
    )

    async def rows(**filters: Any) -> list[Any]:
        base: dict[str, Any] = dict.fromkeys(FILTERS) | {
            "floor_id": published_floor_with_seats["floor"],
            "limit": 50,
        }
        return await search.search(**(base | filters))

    async def ids(**filters: Any) -> set[Any]:
        return {r.id for r in await rows(**filters)}

    assert await ids() == {
        published_floor_with_seats["a"],
        published_floor_with_seats["b"],
        published_floor_with_seats["bookable"],
    }  # the draft-only seat isn't there
    assert await ids(q="maya") == {published_floor_with_seats["a"]}  # by person
    assert await ids(q="platform") == {
        published_floor_with_seats["a"]
    }  # by the holder's primary unit
    assert await ids(q="vision") == {published_floor_with_seats["b"]}  # by the holding unit
    label = next(r.label for r in await rows() if r.id == published_floor_with_seats["a"])
    assert label is not None and await ids(q=label) == {
        published_floor_with_seats["a"]
    }  # by seat label
    assert await ids(status="assigned") == {published_floor_with_seats["a"]}
    assert await ids(status="reserved") == {published_floor_with_seats["b"]}
    assert await ids(status="free") == set()  # the bookable seat isn't "free"
    assert await ids(holder_person_id=who["maya"]) == {published_floor_with_seats["a"]}

    row = (await rows(q="maya"))[0]
    assert row.holder_person is not None and row.holder_person.primary_unit is not None
    assert row.holder_person.primary_unit.name == "Platform"
    assert (
        row.floor.id == published_floor_with_seats["floor"]
        and row.building.id == published_floor_with_seats["building"]
    )
