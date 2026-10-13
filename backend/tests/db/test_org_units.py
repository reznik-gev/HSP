"""Org units and positions against PostgreSQL (docs/0006, docs/0078, docs/0084, docs/0086)."""

import uuid
from datetime import UTC, datetime
from typing import Any

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession

from hsp import models
from hsp.auth.principal import ADMIN_ROLE, Principal
from hsp.models import new_id
from hsp.org.units import PositionIn, UnitIn, UnitsService
from hsp.problems import ProblemException
from tests.db.plan_helpers import make_floor, new_tenant


@pytest.fixture
async def svc(conn: AsyncConnection) -> UnitsService:
    db = AsyncSession(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False)
    # A fresh tenant per test: the single-root rule is per tenant.
    tenant = await new_tenant(db)
    return UnitsService(
        db, Principal("a", "A", None, frozenset({ADMIN_ROLE}), tenant, new_id(), "c")
    )


async def tree(svc: UnitsService) -> dict[str, Any]:
    root = await svc.create(UnitIn(name="Company", level_label="Company"))
    eng = await svc.create(UnitIn(name="Engineering", parent_id=root.id, external_id="ENG"))
    web = await svc.create(UnitIn(name="Web", parent_id=eng.id))
    sales = await svc.create(UnitIn(name="Sales", parent_id=root.id))
    return {"root": root, "eng": eng, "web": web, "sales": sales}


async def test_single_root_and_unique_external_ids(svc: UnitsService) -> None:
    t = await tree(svc)
    with pytest.raises(ProblemException) as exc:
        await svc.create(UnitIn(name="Second root"))
    assert exc.value.slug == "root-exists"
    with pytest.raises(ProblemException) as exc:
        await svc.create(UnitIn(name="Dup", parent_id=t["root"].id, external_id="ENG"))
    assert exc.value.slug == "external-id-taken"


async def test_move_and_cycle_protection(svc: UnitsService) -> None:
    t = await tree(svc)
    moved = await svc.update(t["web"].id, {"parent_id": t["sales"].id})
    assert moved.parent_id == t["sales"].id
    with pytest.raises(ProblemException) as exc:
        await svc.update(t["eng"].id, {"parent_id": t["eng"].id})
    assert exc.value.slug == "unit-cycle"
    await svc.update(t["web"].id, {"parent_id": t["eng"].id})
    with pytest.raises(ProblemException) as exc:  # Engineering under its own sub-unit Web
        await svc.update(t["eng"].id, {"parent_id": t["web"].id})
    assert exc.value.slug == "unit-cycle"
    with pytest.raises(ProblemException) as exc:
        await svc.update(t["root"].id, {"parent_id": t["sales"].id})
    assert exc.value.slug == "root-cannot-move"


async def person(svc: UnitsService, name: str, *memberships: tuple[Any, bool]) -> uuid.UUID:
    now = datetime.now(UTC)
    p = models.Person(
        id=new_id(),
        tenant_id=svc.principal.tenant_id,
        display_name=name,
        email=f"{name.lower()}-{new_id().hex[-8:]}@hsp.local",
        source=models.RecordSource.MANUAL,
        active=True,
        created_at=now,
        updated_at=now,
    )
    svc.db.add(p)
    await svc.db.flush()
    for unit, primary in memberships:
        svc.db.add(
            models.UnitMembership(
                person_id=p.id,
                unit_id=unit.id,
                tenant_id=svc.principal.tenant_id,
                is_primary=primary,
                primary_override=primary,
            )
        )
    await svc.db.flush()
    return p.id


async def memberships(svc: UnitsService, person_id: uuid.UUID) -> set[tuple[uuid.UUID, bool]]:
    rows = await svc.db.scalars(
        select(models.UnitMembership).where(models.UnitMembership.person_id == person_id)
    )
    return {(m.unit_id, m.is_primary) for m in rows}


async def test_archive_cascades_moves_members_up_and_frees_unit_seats(svc: UnitsService) -> None:
    t = await tree(svc)
    root, eng, web, sales = t["root"], t["eng"], t["web"], t["sales"]
    dana = await person(svc, "Dana", (web, True), (sales, False))
    eli = await person(svc, "Eli", (root, True), (eng, False))
    floor, _ = await make_floor(svc.db, svc.principal.tenant_id)
    seat = models.FloorElement(
        id=new_id(), tenant_id=svc.principal.tenant_id, floor_id=floor, kind="object"
    )
    svc.db.add(seat)
    await svc.db.flush()
    svc.db.add(
        models.SeatAssignment(
            id=new_id(),
            tenant_id=svc.principal.tenant_id,
            seat_element_id=seat.id,
            holder_unit_id=web.id,
            assigned_by="a",
        )
    )
    await svc.db.flush()

    report = await svc.archive(eng.id)  # docs/0086: Web goes with it
    assert [a.name for a in report.archived] == ["Engineering", "Web"]
    assert [f.seat_id for f in report.freed_seats] == [seat.id]
    assert {m.person_id for m in report.moved_members} == {dana, eli}
    moved = {m.person_id: m for m in report.moved_members}
    # What Undo needs: Dana's old primary team, and that Eli was already in the root.
    assert [(p.unit_id, p.is_primary) for p in moved[dana].previous] == [(web.id, True)]
    assert (moved[dana].merged, moved[eli].merged) == (False, True)
    # Dana's primary (Web) moves up to Company and stays primary; Eli merges into Company.
    assert await memberships(svc, dana) == {(root.id, True), (sales.id, False)}
    assert await memberships(svc, eli) == {(root.id, True)}
    assert {u.name for u in await svc.list_units(include_archived=False, after=None, limit=50)} == {
        "Company",
        "Sales",
    }

    with pytest.raises(ProblemException) as exc:
        await svc.restore(web.id)
    assert exc.value.slug == "parent-archived"  # restore stays top-down
    await svc.restore(eng.id)
    assert (await svc.restore(web.id)).archived_at is None
    with pytest.raises(ProblemException) as exc:
        await svc.archive(root.id)
    assert exc.value.slug == "root-unit"
    assert (await svc.archive(sales.id)).archived[0].name == "Sales"
    assert (await svc.archive(sales.id)).archived == []  # idempotent


async def test_positions(svc: UnitsService) -> None:
    t = await tree(svc)
    lead = await svc.create_position(t["web"].id, PositionIn(title="Team Lead"))
    await svc.create_position(t["web"].id, PositionIn(title="Engineer"))
    assert [p.title for p in await svc.positions(t["web"].id)] == ["Engineer", "Team Lead"]
    assert (await svc.rename_position(lead.id, PositionIn(title="Tech Lead"))).title == "Tech Lead"
    # Deleting a held position keeps the holder in the unit, without a position (docs/0084).
    person = new_id()
    await svc.db.execute(
        text(
            "INSERT INTO person (id, tenant_id, display_name, email, source, active, "
            "created_at, updated_at) VALUES (:id, :t, 'Dana', :e, 'manual', true, now(), now())"
        ),
        {"id": person, "t": svc.principal.tenant_id, "e": f"dana-{person.hex[:6]}@hsp.local"},
    )
    await svc.db.execute(
        text(
            "INSERT INTO unit_membership (person_id, unit_id, tenant_id, position_id, is_primary, "
            "primary_override) VALUES (:p, :u, :t, :pos, true, false)"
        ),
        {"p": person, "u": t["web"].id, "t": svc.principal.tenant_id, "pos": lead.id},
    )
    await svc.delete_position(lead.id)
    assert [p.title for p in await svc.positions(t["web"].id)] == ["Engineer"]
    membership = (
        await svc.db.execute(
            text("SELECT unit_id, position_id FROM unit_membership WHERE person_id = :p"),
            {"p": person},
        )
    ).one()
    assert tuple(membership) == (t["web"].id, None)
