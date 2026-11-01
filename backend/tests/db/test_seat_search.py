"""Seat search ("where does X sit?") against PostgreSQL (docs/0085)."""

from collections.abc import Awaitable, Callable
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from hsp.models import new_id
from hsp.plans.drafts import SqlDraftRepository
from hsp.plans.publishing import PublishIn, PublishingService, SqlPublishRepository
from hsp.seats.search import SeatOut, SeatSearchService
from tests.db.plan_helpers import add, apply, context, lock, make_floor, stub_desk, stub_zone
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
    bookable one (bookable_inside), and a free desk outside it (outside); nobody sits anywhere.
    Two zones cover outside but don't count: draft_zone is only in the draft, and
    other_floor_zone is published on another floor of the same building."""
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
    ctx["draft_zone"], ctx["other_floor_zone"] = new_id(), new_id()
    await apply(ctx, 0, add("zone", ctx["draft_zone"], **stub_zone(ctx, x=4500)))
    other_floor, _ = await make_floor(ctx["db"], ctx["tenant"], ctx["building"], level=1)
    await lock(ctx["db"], ctx["tenant"], other_floor)
    await apply(
        ctx, 0, add("zone", ctx["other_floor_zone"], **stub_zone(ctx, x=4500)), floor=other_floor
    )
    await publishing.publish(other_floor, PublishIn(base_revision=1))
    return ctx


@pytest.fixture
def found_seats() -> Callable[..., Awaitable[list[SeatOut]]]:
    """Search one test floor's seats as its admin; every filter not given is None."""

    async def search(ctx: dict[str, Any], **filters: Any) -> list[SeatOut]:
        base: dict[str, Any] = dict.fromkeys(FILTERS) | {"floor_id": ctx["floor"], "limit": 50}
        return await SeatSearchService(ctx["db"], ctx["admin"]).search(**(base | filters))

    return search


@pytest.fixture
def found_seat_ids(
    found_seats: Callable[..., Awaitable[list[SeatOut]]],
) -> Callable[..., Awaitable[set[Any]]]:
    """The ids of the seats `found_seats` finds."""

    async def ids(ctx: dict[str, Any], **filters: Any) -> set[Any]:
        return {r.id for r in await found_seats(ctx, **filters)}

    return ids


async def test_where_does_x_sit(
    published_floor_with_seats: dict[str, Any],
    found_seats: Callable[..., Awaitable[list[SeatOut]]],
    found_seat_ids: Callable[..., Awaitable[set[Any]]],
) -> None:
    ctx = published_floor_with_seats
    who = await seated(ctx)

    assert await found_seat_ids(ctx) == {
        ctx["a"],
        ctx["b"],
        ctx["bookable"],
    }  # the draft-only seat isn't there
    assert await found_seat_ids(ctx, q="maya") == {ctx["a"]}  # by person
    assert await found_seat_ids(ctx, q="platform") == {ctx["a"]}  # by the holder's primary unit
    assert await found_seat_ids(ctx, q="vision") == {ctx["b"]}  # by the holding unit
    label = next(r.label for r in await found_seats(ctx) if r.id == ctx["a"])
    assert label is not None and await found_seat_ids(ctx, q=label) == {ctx["a"]}  # by seat label
    assert await found_seat_ids(ctx, status="assigned") == {ctx["a"]}
    assert await found_seat_ids(ctx, status="reserved") == {ctx["b"]}
    assert await found_seat_ids(ctx, status="free") == set()  # the bookable seat isn't "free"
    assert await found_seat_ids(ctx, holder_person_id=who["maya"]) == {ctx["a"]}

    row = (await found_seats(ctx, q="maya"))[0]
    assert row.holder_person is not None and row.holder_person.primary_unit is not None
    assert row.holder_person.primary_unit.name == "Platform"
    assert row.floor.id == ctx["floor"] and row.building.id == ctx["building"]


async def test_free_and_bookable_seats_and_by_zone(
    zone_with_free_seats: dict[str, Any], found_seat_ids: Callable[..., Awaitable[set[Any]]]
) -> None:
    """The free seats list (docs/0108): free, bookable, either, and inside a zone."""
    ctx = zone_with_free_seats

    assert await found_seat_ids(ctx, status="free") == {ctx["inside"], ctx["outside"]}
    assert await found_seat_ids(ctx, status="bookable") == {ctx["bookable_inside"]}
    assert await found_seat_ids(ctx, status="available") == {
        ctx["inside"],
        ctx["outside"],
        ctx["bookable_inside"],
    }
    assert await found_seat_ids(ctx, zone_id=ctx["zone"]) == {ctx["inside"], ctx["bookable_inside"]}
    assert await found_seat_ids(ctx, zone_id=ctx["zone"], status="free") == {ctx["inside"]}
    assert await found_seat_ids(ctx, zone_id=new_id()) == set()  # no such zone
    assert await found_seat_ids(ctx, zone_id=ctx["draft_zone"]) == set()  # not published yet
    assert await found_seat_ids(ctx, zone_id=ctx["other_floor_zone"]) == set()  # another floor
