"""Org units and positions against PostgreSQL (docs/0006, docs/0078, docs/0084, docs/0086)."""

import uuid
from datetime import UTC, datetime
from typing import Any

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from hsp import models
from hsp.auth.principal import ADMIN_ROLE, Principal
from hsp.models import new_id
from hsp.org.units import PositionIn, UnitIn, UnitsService
from hsp.problems import ProblemException
from tests.db.plan_helpers import make_floor, new_tenant


@pytest.fixture
async def units_service_in_own_tenant(rolled_back_db_session: AsyncSession) -> UnitsService:
    # A fresh tenant per test: the single-root rule is per tenant.
    tenant = await new_tenant(rolled_back_db_session)
    return UnitsService(
        rolled_back_db_session,
        Principal("a", "A", None, frozenset({ADMIN_ROLE}), tenant, new_id(), "c"),
    )


async def tree(units_service_in_own_tenant: UnitsService) -> dict[str, Any]:
    root = await units_service_in_own_tenant.create(UnitIn(name="Company", level_label="Company"))
    eng = await units_service_in_own_tenant.create(
        UnitIn(name="Engineering", parent_id=root.id, external_id="ENG")
    )
    web = await units_service_in_own_tenant.create(UnitIn(name="Web", parent_id=eng.id))
    sales = await units_service_in_own_tenant.create(UnitIn(name="Sales", parent_id=root.id))
    return {"root": root, "eng": eng, "web": web, "sales": sales}


async def test_single_root_and_unique_external_ids(
    units_service_in_own_tenant: UnitsService,
) -> None:
    t = await tree(units_service_in_own_tenant)
    with pytest.raises(ProblemException) as exc:
        await units_service_in_own_tenant.create(UnitIn(name="Second root"))
    assert exc.value.slug == "root-exists"
    with pytest.raises(ProblemException) as exc:
        await units_service_in_own_tenant.create(
            UnitIn(name="Dup", parent_id=t["root"].id, external_id="ENG")
        )
    assert exc.value.slug == "external-id-taken"


async def test_move_and_cycle_protection(units_service_in_own_tenant: UnitsService) -> None:
    t = await tree(units_service_in_own_tenant)
    moved = await units_service_in_own_tenant.update(t["web"].id, {"parent_id": t["sales"].id})
    assert moved.parent_id == t["sales"].id
    with pytest.raises(ProblemException) as exc:
        await units_service_in_own_tenant.update(t["eng"].id, {"parent_id": t["eng"].id})
    assert exc.value.slug == "unit-cycle"
    await units_service_in_own_tenant.update(t["web"].id, {"parent_id": t["eng"].id})
    with pytest.raises(ProblemException) as exc:  # Engineering under its own sub-unit Web
        await units_service_in_own_tenant.update(t["eng"].id, {"parent_id": t["web"].id})
    assert exc.value.slug == "unit-cycle"
    with pytest.raises(ProblemException) as exc:
        await units_service_in_own_tenant.update(t["root"].id, {"parent_id": t["sales"].id})
    assert exc.value.slug == "root-cannot-move"


async def person(
    units_service_in_own_tenant: UnitsService, name: str, *memberships: tuple[Any, bool]
) -> uuid.UUID:
    now = datetime.now(UTC)
    p = models.Person(
        id=new_id(),
        tenant_id=units_service_in_own_tenant.principal.tenant_id,
        display_name=name,
        email=f"{name.lower()}-{new_id().hex[-8:]}@hsp.local",
        source=models.RecordSource.MANUAL,
        active=True,
        created_at=now,
        updated_at=now,
    )
    units_service_in_own_tenant.db.add(p)
    await units_service_in_own_tenant.db.flush()
    for unit, primary in memberships:
        units_service_in_own_tenant.db.add(
            models.UnitMembership(
                person_id=p.id,
                unit_id=unit.id,
                tenant_id=units_service_in_own_tenant.principal.tenant_id,
                is_primary=primary,
                primary_override=primary,
            )
        )
    await units_service_in_own_tenant.db.flush()
    return p.id


async def memberships(
    units_service_in_own_tenant: UnitsService, person_id: uuid.UUID
) -> set[tuple[uuid.UUID, bool]]:
    rows = await units_service_in_own_tenant.db.scalars(
        select(models.UnitMembership).where(models.UnitMembership.person_id == person_id)
    )
    return {(m.unit_id, m.is_primary) for m in rows}


async def test_archive_cascades_moves_members_up_and_frees_unit_seats(
    units_service_in_own_tenant: UnitsService,
) -> None:
    t = await tree(units_service_in_own_tenant)
    root, eng, web, sales = t["root"], t["eng"], t["web"], t["sales"]
    dana = await person(units_service_in_own_tenant, "Dana", (web, True), (sales, False))
    eli = await person(units_service_in_own_tenant, "Eli", (root, True), (eng, False))
    floor, _ = await make_floor(
        units_service_in_own_tenant.db, units_service_in_own_tenant.principal.tenant_id
    )
    seat = models.FloorElement(
        id=new_id(),
        tenant_id=units_service_in_own_tenant.principal.tenant_id,
        floor_id=floor,
        kind="object",
    )
    units_service_in_own_tenant.db.add(seat)
    await units_service_in_own_tenant.db.flush()
    units_service_in_own_tenant.db.add(
        models.SeatAssignment(
            id=new_id(),
            tenant_id=units_service_in_own_tenant.principal.tenant_id,
            seat_element_id=seat.id,
            holder_unit_id=web.id,
            assigned_by="a",
        )
    )
    await units_service_in_own_tenant.db.flush()

    report = await units_service_in_own_tenant.archive(eng.id)  # docs/0086: Web goes with it
    assert [a.name for a in report.archived] == ["Engineering", "Web"]
    assert [f.seat_id for f in report.freed_seats] == [seat.id]
    assert {m.person_id for m in report.moved_members} == {dana, eli}
    moved = {m.person_id: m for m in report.moved_members}
    # What Undo needs: Dana's old primary team, and that Eli was already in the root.
    assert [(p.unit_id, p.is_primary) for p in moved[dana].previous] == [(web.id, True)]
    assert (moved[dana].merged, moved[eli].merged) == (False, True)
    # Dana's primary (Web) moves up to Company and stays primary; Eli merges into Company.
    assert await memberships(units_service_in_own_tenant, dana) == {
        (root.id, True),
        (sales.id, False),
    }
    assert await memberships(units_service_in_own_tenant, eli) == {(root.id, True)}
    assert {
        u.name
        for u in await units_service_in_own_tenant.list_units(
            include_archived=False, after=None, limit=50
        )
    } == {
        "Company",
        "Sales",
    }

    with pytest.raises(ProblemException) as exc:
        await units_service_in_own_tenant.restore(web.id)
    assert exc.value.slug == "parent-archived"  # restore stays top-down
    await units_service_in_own_tenant.restore(eng.id)
    assert (await units_service_in_own_tenant.restore(web.id)).archived_at is None
    with pytest.raises(ProblemException) as exc:
        await units_service_in_own_tenant.archive(root.id)
    assert exc.value.slug == "root-unit"
    assert (await units_service_in_own_tenant.archive(sales.id)).archived[0].name == "Sales"
    assert (await units_service_in_own_tenant.archive(sales.id)).archived == []  # idempotent


async def test_positions(units_service_in_own_tenant: UnitsService) -> None:
    t = await tree(units_service_in_own_tenant)
    lead = await units_service_in_own_tenant.create_position(
        t["web"].id, PositionIn(title="Team Lead")
    )
    await units_service_in_own_tenant.create_position(t["web"].id, PositionIn(title="Engineer"))
    assert [p.title for p in await units_service_in_own_tenant.positions(t["web"].id)] == [
        "Engineer",
        "Team Lead",
    ]
    assert (
        await units_service_in_own_tenant.rename_position(lead.id, PositionIn(title="Tech Lead"))
    ).title == "Tech Lead"
    # Deleting a held position keeps the holder in the unit, without a position (docs/0084).
    person = new_id()
    await units_service_in_own_tenant.db.execute(
        text(
            "INSERT INTO person (id, tenant_id, display_name, email, source, active, "
            "created_at, updated_at) VALUES (:id, :t, 'Dana', :e, 'manual', true, now(), now())"
        ),
        {
            "id": person,
            "t": units_service_in_own_tenant.principal.tenant_id,
            "e": f"dana-{person.hex[:6]}@hsp.local",
        },
    )
    await units_service_in_own_tenant.db.execute(
        text(
            "INSERT INTO unit_membership (person_id, unit_id, tenant_id, position_id, is_primary, "
            "primary_override) VALUES (:p, :u, :t, :pos, true, false)"
        ),
        {
            "p": person,
            "u": t["web"].id,
            "t": units_service_in_own_tenant.principal.tenant_id,
            "pos": lead.id,
        },
    )
    await units_service_in_own_tenant.delete_position(lead.id)
    assert [p.title for p in await units_service_in_own_tenant.positions(t["web"].id)] == [
        "Engineer"
    ]
    membership = (
        await units_service_in_own_tenant.db.execute(
            text("SELECT unit_id, position_id FROM unit_membership WHERE person_id = :p"),
            {"p": person},
        )
    ).one()
    assert tuple(membership) == (t["web"].id, None)
