"""Org units and positions against PostgreSQL (docs/0006, docs/0078, docs/0084)."""

from typing import Any

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession

from hsp.auth.principal import ADMIN_ROLE, Principal
from hsp.models import new_id
from hsp.org.units import PositionIn, UnitIn, UnitsService
from hsp.problems import ProblemException


@pytest.fixture
async def svc(conn: AsyncConnection) -> UnitsService:
    db = AsyncSession(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False)
    # A fresh tenant per test: the single-root rule is per tenant.
    tenant = new_id()
    await db.execute(
        text(
            "INSERT INTO tenant (id, name, slug, created_at, updated_at) "
            "VALUES (:id, 'T', :s, now(), now())"
        ),
        {"id": tenant, "s": f"t-{tenant.hex[:8]}"},
    )
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


async def test_archive_bottom_up_restore_top_down(svc: UnitsService) -> None:
    t = await tree(svc)
    with pytest.raises(ProblemException) as exc:
        await svc.archive(t["eng"].id)
    assert exc.value.slug == "has-active-children"
    assert exc.value.errors is not None and exc.value.errors[0].message == "Web"
    await svc.archive(t["web"].id)
    await svc.archive(t["eng"].id)
    assert {u.name for u in await svc.list_units(include_archived=False, after=None, limit=50)} == {
        "Company",
        "Sales",
    }
    with pytest.raises(ProblemException) as exc:
        await svc.restore(t["web"].id)
    assert exc.value.slug == "parent-archived"
    await svc.restore(t["eng"].id)
    assert (await svc.restore(t["web"].id)).archived_at is None


async def test_positions(svc: UnitsService) -> None:
    t = await tree(svc)
    lead = await svc.create_position(t["web"].id, PositionIn(title="Team Lead"))
    await svc.create_position(t["web"].id, PositionIn(title="Engineer"))
    assert [p.title for p in await svc.positions(t["web"].id)] == ["Engineer", "Team Lead"]
    assert (await svc.rename_position(lead.id, PositionIn(title="Tech Lead"))).title == "Tech Lead"
    await svc.delete_position(lead.id)
    assert [p.title for p in await svc.positions(t["web"].id)] == ["Engineer"]
