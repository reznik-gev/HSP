"""Occupancy per floor, building, site and unit against PostgreSQL (docs/0025, docs/0085)."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select

from hsp import models
from hsp.seats.occupancy import Counts, OccupancyService
from tests.db.seat_helpers import seated


async def test_occupancy_per_floor_building_site_and_unit(
    published_floor_with_seats: dict[str, Any],
) -> None:
    who = await seated(published_floor_with_seats)
    occupancy = OccupancyService(
        published_floor_with_seats["db"], published_floor_with_seats["admin"]
    )
    expected = Counts(
        total=3, assigned_to_people=1, reserved_for_units=1, free=0, bookable=1, unavailable=0
    )
    assert (await occupancy.floor(published_floor_with_seats["floor"])).counts == expected
    building = await occupancy.building(published_floor_with_seats["building"])
    assert building.counts == expected and [f.id for f in building.floors] == [
        published_floor_with_seats["floor"]
    ]
    site_id = await published_floor_with_seats["db"].scalar(
        select(models.Building.site_id).where(
            models.Building.id == published_floor_with_seats["building"]
        )
    )
    assert (await occupancy.site(site_id)).counts == expected

    platform = await occupancy.unit(who["platform"], include_sub_units=False)
    assert (platform.member_held, platform.members, platform.members_without_seat) == (1, 2, 1)
    assert (await occupancy.unit(who["vision"], include_sub_units=False)).unit_held == 1
    root = await published_floor_with_seats["db"].scalar(
        select(models.OrgUnit.parent_id).where(models.OrgUnit.id == who["platform"])
    )
    everyone = await occupancy.unit(root, include_sub_units=True)
    assert (everyone.unit_held, everyone.member_held) == (1, 1)

    # Archived floors drop out of the rollups.
    floor = await published_floor_with_seats["db"].get(
        models.Floor, published_floor_with_seats["floor"]
    )
    floor.archived_at = datetime.now(UTC)
    await published_floor_with_seats["db"].flush()
    assert (await occupancy.building(published_floor_with_seats["building"])).counts == Counts()
