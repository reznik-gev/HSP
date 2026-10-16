"""Occupancy per floor, building, site and unit against PostgreSQL (docs/0025, docs/0085)."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select

from hsp import models
from hsp.seats.occupancy import Counts, OccupancyService
from tests.db.seat_helpers import seated


async def test_occupancy_per_floor_building_site_and_unit(seat_floor: dict[str, Any]) -> None:
    who = await seated(seat_floor)
    occupancy = OccupancyService(seat_floor["db"], seat_floor["admin"])
    expected = Counts(
        total=3, assigned_to_people=1, reserved_for_units=1, free=0, bookable=1, unavailable=0
    )
    assert (await occupancy.floor(seat_floor["floor"])).counts == expected
    building = await occupancy.building(seat_floor["building"])
    assert building.counts == expected and [f.id for f in building.floors] == [seat_floor["floor"]]
    site_id = await seat_floor["db"].scalar(
        select(models.Building.site_id).where(models.Building.id == seat_floor["building"])
    )
    assert (await occupancy.site(site_id)).counts == expected

    platform = await occupancy.unit(who["platform"], include_sub_units=False)
    assert (platform.member_held, platform.members, platform.members_without_seat) == (1, 2, 1)
    assert (await occupancy.unit(who["vision"], include_sub_units=False)).unit_held == 1
    root = await seat_floor["db"].scalar(
        select(models.OrgUnit.parent_id).where(models.OrgUnit.id == who["platform"])
    )
    everyone = await occupancy.unit(root, include_sub_units=True)
    assert (everyone.unit_held, everyone.member_held) == (1, 1)

    # Archived floors drop out of the rollups.
    floor = await seat_floor["db"].get(models.Floor, seat_floor["floor"])
    floor.archived_at = datetime.now(UTC)
    await seat_floor["db"].flush()
    assert (await occupancy.building(seat_floor["building"])).counts == Counts()
