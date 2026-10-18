"""Location archiving cascades and frees seats, against PostgreSQL (docs/0078, docs/0086)."""

from datetime import UTC, datetime
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from hsp import models
from hsp.locations.buildings import BuildingsService
from hsp.locations.repository import SqlLocationsRepository
from hsp.models import new_id
from tests.db.plan_helpers import make_floor, new_tenant
from tests.stubs import stub_admin


@pytest.fixture
async def floor_in_own_tenant(rolled_back_db_session: AsyncSession) -> dict[str, Any]:
    """A floor in a tenant of its own, and its admin."""
    tenant = await new_tenant(rolled_back_db_session)
    floor, building = await make_floor(rolled_back_db_session, tenant)
    admin = stub_admin(tenant)
    return {
        "db": rolled_back_db_session,
        "tenant": tenant,
        "floor": floor,
        "building": building,
        "admin": admin,
    }


async def test_building_archive_frees_seats_on_all_its_floors(
    floor_in_own_tenant: dict[str, Any],
) -> None:
    rolled_back_db_session, tenant = floor_in_own_tenant["db"], floor_in_own_tenant["tenant"]
    second, _ = await make_floor(
        rolled_back_db_session, tenant, floor_in_own_tenant["building"], level=1
    )
    seats = []
    for floor in (floor_in_own_tenant["floor"], second):
        seat = models.FloorElement(id=new_id(), tenant_id=tenant, floor_id=floor, kind="object")
        rolled_back_db_session.add(seat)
        await rolled_back_db_session.flush()
        rolled_back_db_session.add(
            models.SeatAssignment(
                id=new_id(),
                tenant_id=tenant,
                seat_element_id=seat.id,
                holder_unit_id=None,
                holder_person_id=await person(rolled_back_db_session, tenant),
                assigned_by="a",
            )
        )
        seats.append(seat.id)
    await rolled_back_db_session.flush()

    service = BuildingsService(
        SqlLocationsRepository(rolled_back_db_session), floor_in_own_tenant["admin"]
    )
    report = await service.archive(floor_in_own_tenant["building"])
    assert [a.kind for a in report.archived] == ["building", "floor", "floor"]
    assert sorted(f.seat_id for f in report.freed_seats) == sorted(seats)
    left = await rolled_back_db_session.scalars(
        select(models.SeatAssignment).where(models.SeatAssignment.tenant_id == tenant)
    )
    assert list(left) == []
    actions = list(
        await rolled_back_db_session.scalars(
            select(models.AuditEvent.action).where(models.AuditEvent.tenant_id == tenant)
        )
    )
    assert actions.count("seat.unassigned") == 2 and actions.count("floor.archived") == 2


async def person(rolled_back_db_session: AsyncSession, tenant: Any) -> Any:
    p = models.Person(
        id=new_id(),
        tenant_id=tenant,
        display_name="P",
        email=f"p-{new_id().hex[-8:]}@hsp.local",
        source=models.RecordSource.MANUAL,
        active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    rolled_back_db_session.add(p)
    await rolled_back_db_session.flush()
    return p.id
