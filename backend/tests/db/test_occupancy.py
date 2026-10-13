"""Occupancy per floor, building, site and unit against PostgreSQL (docs/0025, docs/0085)."""

from datetime import UTC, datetime
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncConnection

from hsp import models
from hsp.seats.occupancy import Counts, OccupancyService
from tests.db.seat_helpers import published_seats, seated


@pytest.fixture
async def ctx(conn: AsyncConnection) -> dict[str, Any]:
    return await published_seats(conn)


async def test_occupancy_per_floor_building_site_and_unit(ctx: dict[str, Any]) -> None:
    who = await seated(ctx)
    occupancy = OccupancyService(ctx["db"], ctx["admin"])
    expected = Counts(
        total=3, assigned_to_people=1, reserved_for_units=1, free=0, bookable=1, unavailable=0
    )
    assert (await occupancy.floor(ctx["floor"])).counts == expected
    building = await occupancy.building(ctx["building"])
    assert building.counts == expected and [f.id for f in building.floors] == [ctx["floor"]]
    site_id = await ctx["db"].scalar(
        select(models.Building.site_id).where(models.Building.id == ctx["building"])
    )
    assert (await occupancy.site(site_id)).counts == expected

    platform = await occupancy.unit(who["platform"], include_sub_units=False)
    assert (platform.member_held, platform.members, platform.members_without_seat) == (1, 2, 1)
    assert (await occupancy.unit(who["vision"], include_sub_units=False)).unit_held == 1
    root = await ctx["db"].scalar(
        select(models.OrgUnit.parent_id).where(models.OrgUnit.id == who["platform"])
    )
    everyone = await occupancy.unit(root, include_sub_units=True)
    assert (everyone.unit_held, everyone.member_held) == (1, 1)

    # Archived floors drop out of the rollups.
    floor = await ctx["db"].get(models.Floor, ctx["floor"])
    floor.archived_at = datetime.now(UTC)
    await ctx["db"].flush()
    assert (await occupancy.building(ctx["building"])).counts == Counts()
