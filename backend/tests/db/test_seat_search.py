"""Seat search ("where does X sit?") against PostgreSQL (docs/0085)."""

from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from hsp.models import new_id
from hsp.plans.drafts import SqlDraftRepository
from hsp.plans.publishing import PublishIn, PublishingService, SqlPublishRepository
from hsp.seats.search import SeatSearchService
from tests.db.plan_helpers import add, apply, context, stub_desk, stub_zone
from tests.db.seat_helpers import seated

FILTERS = (
    "q",
    "site_id",
    "building_id",
    "holder_person_id",
    "holder_unit_id",
    "status",
    "zone_id",
    "after",
)


@pytest.fixture
async def zone_with_free_seats(rolled_back_db_session: AsyncSession) -> dict[str, Any]:
    """A published floor with a zone (0..4000 x 0..3000) holding a free desk (inside) and a
    bookable one (bookable_inside), and a free desk outside it (outside); nobody sits anywhere."""
    ctx = await context(rolled_back_db_session)
    ctx["zone"], ctx["inside"], ctx["bookable_inside"], ctx["outside"] = (
        new_id() for _ in range(4)
    )
    await apply(
        ctx,
        0,
        add("zone", ctx["zone"], **stub_zone(ctx, x=0)),
        add("object", ctx["inside"], **stub_desk(ctx, x=1000, label="IN")),
        add(
            "object",
            ctx["bookable_inside"],
            **stub_desk(ctx, x=3000, label="BK", allocation_mode="bookable"),
        ),
        add("object", ctx["outside"], **stub_desk(ctx, x=6000, label="OUT")),
    )
    publishing = PublishingService(
        SqlDraftRepository(ctx["db"]), SqlPublishRepository(ctx["db"]), ctx["admin"]
    )
    await publishing.publish(ctx["floor"], PublishIn(base_revision=1))
    return ctx


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


async def test_free_and_bookable_seats_and_by_zone(zone_with_free_seats: dict[str, Any]) -> None:
    """The free seats list (docs/0108): free, bookable, either, and inside a zone."""
    ctx = zone_with_free_seats
    search = SeatSearchService(ctx["db"], ctx["admin"])

    async def ids(**filters: Any) -> set[Any]:
        base: dict[str, Any] = dict.fromkeys(FILTERS) | {"floor_id": ctx["floor"], "limit": 50}
        return {r.id for r in await search.search(**(base | filters))}

    assert await ids(status="free") == {ctx["inside"], ctx["outside"]}
    assert await ids(status="bookable") == {ctx["bookable_inside"]}
    assert await ids(status="available") == {ctx["inside"], ctx["outside"], ctx["bookable_inside"]}
    assert await ids(zone_id=ctx["zone"]) == {ctx["inside"], ctx["bookable_inside"]}
    assert await ids(zone_id=ctx["zone"], status="free") == {ctx["inside"]}
    assert await ids(zone_id=new_id()) == set()  # no such zone
