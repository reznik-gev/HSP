"""Seat search and occupancy against PostgreSQL (docs/0025, docs/0085)."""

from datetime import UTC, datetime
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncConnection

from hsp import models
from hsp.seats.assignments import AssignmentIn, SeatAssignmentService
from hsp.seats.search import Counts, SeatSearchService
from tests.db.seat_helpers import person, published_seats, unit


@pytest.fixture
async def ctx(conn: AsyncConnection) -> dict[str, Any]:
    return await published_seats(conn)


FILTERS = ("q", "site_id", "building_id", "holder_person_id", "holder_unit_id", "status", "after")


async def member(ctx: dict[str, Any], person_id: Any, unit_id: Any) -> None:
    ctx["db"].add(
        models.UnitMembership(
            person_id=person_id,
            unit_id=unit_id,
            tenant_id=ctx["tenant"],
            is_primary=True,
            primary_override=True,
        )
    )
    await ctx["db"].flush()


async def seated(ctx: dict[str, Any]) -> dict[str, Any]:
    """Maya (primary unit Platform) sits at seat A; seat B is reserved for Vision."""
    seats = SeatAssignmentService(ctx["db"], ctx["admin"])
    platform, vision = await unit(ctx, "Platform"), await unit(ctx, "Vision")
    maya, eli = await person(ctx, "Maya"), await person(ctx, "Eli")
    await member(ctx, maya, platform)
    await member(ctx, eli, platform)
    await seats.assign(ctx["a"], AssignmentIn(person_id=maya))
    await seats.assign(ctx["b"], AssignmentIn(unit_id=vision))
    return {"platform": platform, "vision": vision, "maya": maya, "eli": eli}


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


async def test_occupancy_per_floor_building_site_and_unit(ctx: dict[str, Any]) -> None:
    who = await seated(ctx)
    search = SeatSearchService(ctx["db"], ctx["admin"])
    expected = Counts(
        total=3, assigned_to_people=1, reserved_for_units=1, free=0, bookable=1, unavailable=0
    )
    assert (await search.floor(ctx["floor"])).counts == expected
    building = await search.building(ctx["building"])
    assert building.counts == expected and [f.id for f in building.floors] == [ctx["floor"]]
    site_id = await ctx["db"].scalar(
        select(models.Building.site_id).where(models.Building.id == ctx["building"])
    )
    assert (await search.site(site_id)).counts == expected

    platform = await search.unit(who["platform"], include_sub_units=False)
    assert (platform.member_held, platform.members, platform.members_without_seat) == (1, 2, 1)
    assert (await search.unit(who["vision"], include_sub_units=False)).unit_held == 1
    root = await ctx["db"].scalar(
        select(models.OrgUnit.parent_id).where(models.OrgUnit.id == who["platform"])
    )
    everyone = await search.unit(root, include_sub_units=True)
    assert (everyone.unit_held, everyone.member_held) == (1, 1)

    # Archived floors drop out of the rollups.
    floor = await ctx["db"].get(models.Floor, ctx["floor"])
    floor.archived_at = datetime.now(UTC)
    await ctx["db"].flush()
    assert (await search.building(ctx["building"])).counts == Counts()
