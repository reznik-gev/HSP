"""Location archiving cascades and frees seats, against PostgreSQL (docs/0078, docs/0086)."""

from datetime import UTC, datetime
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from hsp import models
from hsp.auth.principal import ADMIN_ROLE, Principal
from hsp.locations.buildings import BuildingsService
from hsp.locations.repository import SqlLocationsRepository
from hsp.models import new_id
from tests.db.plan_helpers import make_floor, new_tenant


@pytest.fixture
async def own_tenant(db: AsyncSession) -> dict[str, Any]:
    """A floor in a tenant of its own, and its admin."""
    tenant = await new_tenant(db)
    floor, building = await make_floor(db, tenant)
    admin = Principal("alice", "Alice", None, frozenset({ADMIN_ROLE}), tenant, new_id(), "c")
    return {"db": db, "tenant": tenant, "floor": floor, "building": building, "admin": admin}


async def test_building_archive_frees_seats_on_all_its_floors(own_tenant: dict[str, Any]) -> None:
    db, tenant = own_tenant["db"], own_tenant["tenant"]
    second, _ = await make_floor(db, tenant, own_tenant["building"], level=1)
    seats = []
    for floor in (own_tenant["floor"], second):
        seat = models.FloorElement(id=new_id(), tenant_id=tenant, floor_id=floor, kind="object")
        db.add(seat)
        await db.flush()
        db.add(
            models.SeatAssignment(
                id=new_id(),
                tenant_id=tenant,
                seat_element_id=seat.id,
                holder_unit_id=None,
                holder_person_id=await person(db, tenant),
                assigned_by="a",
            )
        )
        seats.append(seat.id)
    await db.flush()

    service = BuildingsService(SqlLocationsRepository(db), own_tenant["admin"])
    report = await service.archive(own_tenant["building"])
    assert [a.kind for a in report.archived] == ["building", "floor", "floor"]
    assert sorted(f.seat_id for f in report.freed_seats) == sorted(seats)
    left = await db.scalars(
        select(models.SeatAssignment).where(models.SeatAssignment.tenant_id == tenant)
    )
    assert list(left) == []
    actions = list(
        await db.scalars(
            select(models.AuditEvent.action).where(models.AuditEvent.tenant_id == tenant)
        )
    )
    assert actions.count("seat.unassigned") == 2 and actions.count("floor.archived") == 2


async def person(db: AsyncSession, tenant: Any) -> Any:
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
    db.add(p)
    await db.flush()
    return p.id
