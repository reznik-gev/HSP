"""Drafts and changesets against PostgreSQL (docs/0028, docs/0061 item 2, docs/0081).

The key property: editing in a new draft never changes a published version.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from pydantic import TypeAdapter
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession

from hsp import models
from hsp.auth.principal import ADMIN_ROLE, Principal
from hsp.models import new_id
from hsp.plans.changeset import ChangesetIn
from hsp.plans.drafts import DraftsService, SqlDraftRepository
from hsp.plans.locks import SqlLockRepository
from hsp.plans.repository import SqlPlanRepository
from hsp.problems import ProblemException

changeset = TypeAdapter(ChangesetIn)


@pytest.fixture
async def ctx(conn: AsyncConnection) -> dict[str, Any]:
    db = AsyncSession(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False)
    tenant = (await db.execute(text("SELECT id FROM tenant WHERE slug = 'default'"))).scalar_one()
    now = datetime.now(UTC)
    site = models.Site(
        id=new_id(), tenant_id=tenant, name="HQ", time_zone="UTC", created_at=now, updated_at=now
    )
    building = models.Building(
        id=new_id(),
        tenant_id=tenant,
        site_id=site.id,
        name="B",
        code=f"B{new_id().hex[:6]}",
        created_at=now,
        updated_at=now,
    )
    floor = models.Floor(
        id=new_id(),
        tenant_id=tenant,
        building_id=building.id,
        name="G",
        level_index=0,
        elevation_mm=0,
        default_wall_height_mm=2800,
        origin_x_mm=0,
        origin_y_mm=0,
        created_at=now,
        updated_at=now,
    )
    for row in (site, building, floor):
        db.add(row)
        await db.flush()
    admin = Principal("alice", "Alice", None, frozenset({ADMIN_ROLE}), tenant, new_id(), "c")
    await SqlLockRepository(db).try_acquire(
        tenant,
        floor.id,
        subject="alice",
        name="Alice",
        now=now,
        expires_at=now + timedelta(minutes=15),
    )
    desk_rev = await db.scalar(
        select(models.CatalogItemRev.id)
        .join(models.CatalogItem)
        .where(models.CatalogItem.key == "desk_1600x800")
    )
    zone_type = (
        await db.execute(
            text("SELECT id FROM zone_type WHERE tenant_id = :t LIMIT 1"), {"t": tenant}
        )
    ).scalar_one()
    return {
        "db": db,
        "tenant": tenant,
        "floor": floor.id,
        "admin": admin,
        "desk_rev": desk_rev,
        "zone_type": zone_type,
    }


def service(ctx: dict[str, Any], who: Principal | None = None) -> DraftsService:
    return DraftsService(SqlDraftRepository(ctx["db"]), who or ctx["admin"])


async def apply(
    ctx: dict[str, Any], base: int, *ops: dict[str, Any], who: Principal | None = None
) -> Any:
    return await service(ctx, who).apply(
        ctx["floor"], changeset.validate_python({"base_revision": base, "ops": list(ops)})
    )


async def plan(ctx: dict[str, Any], version: int) -> Any:
    return await SqlPlanRepository(ctx["db"]).load_content(ctx["tenant"], ctx["floor"], version)


def add(kind: str, element_id: uuid.UUID, **data: Any) -> dict[str, Any]:
    return {"op": "add", "kind": kind, "id": str(element_id), "data": data}


def wall_data() -> dict[str, Any]:
    return {"a": [0, 0], "b": [6000, 0], "thickness_mm": 150, "height_mm": 2800}


def desk_data(ctx: dict[str, Any], x: int = 1000) -> dict[str, Any]:
    return {
        "catalog_item_rev_id": str(ctx["desk_rev"]),
        "position": [x, 1000, 0],
        "allocation_mode": "assigned",
        "label": "D1",
    }


async def count(ctx: dict[str, Any], model: Any, element_id: uuid.UUID) -> int:
    return int(
        await ctx["db"].scalar(
            select(func.count()).select_from(model).where(model.element_id == element_id)
        )
    )


async def test_first_changeset_creates_the_draft_and_saves_everything(ctx: dict[str, Any]) -> None:
    w, door, desk, zone = new_id(), new_id(), new_id(), new_id()
    result = await apply(
        ctx,
        0,
        add("wall", w, **wall_data()),
        add(
            "opening",
            door,
            wall_id=str(w),
            type="door",
            offset_mm=1000,
            width_mm=900,
            height_mm=2100,
            swing="left_in",
        ),
        add("object", desk, **desk_data(ctx)),
        add(
            "zone",
            zone,
            name="Pod A",
            zone_type_id=str(ctx["zone_type"]),
            boundary=[[0, 0], [4000, 0], [4000, 3000], [0, 3000]],
        ),
    )
    assert (result.version, result.revision) == (1, 1)  # never-published floor: draft is v1
    v1 = await plan(ctx, 1)
    assert [x.id for x in v1.walls] == [w] and v1.openings[
        0
    ].wall_id == w  # wall + door in one go (FK order)
    assert v1.objects[0].position == (1000, 1000, 0) and v1.zones[0].name == "Pod A"
    actions = (
        await ctx["db"].scalars(
            select(models.AuditEvent.action).where(models.AuditEvent.entity_id == ctx["floor"])
        )
    ).all()
    assert "floor.draft_created" in actions


async def test_edits_within_a_draft_update_in_place(ctx: dict[str, Any]) -> None:
    desk = new_id()
    await apply(ctx, 0, add("object", desk, **desk_data(ctx)))
    r = await apply(
        ctx,
        1,
        {"op": "update", "kind": "object", "id": str(desk), "data": {"position": [2500, 1000, 0]}},
    )
    assert r.revision == 2
    assert await count(ctx, models.ObjectRev, desk) == 1  # same draft: no new revision row
    assert (await plan(ctx, 1)).objects[0].position == (2500, 1000, 0)


async def test_editing_a_new_draft_never_changes_the_published_version(ctx: dict[str, Any]) -> None:
    db, floor = ctx["db"], ctx["floor"]
    w, door, desk, new_desk = new_id(), new_id(), new_id(), new_id()
    await apply(
        ctx,
        0,
        add("wall", w, **wall_data()),
        add(
            "opening",
            door,
            wall_id=str(w),
            type="door",
            offset_mm=1000,
            width_mm=900,
            height_mm=2100,
            swing="none",
        ),
        add("object", desk, **desk_data(ctx)),
    )
    # Publish v1 by hand (the publish endpoint comes in step 7).
    await db.execute(
        text("UPDATE floor_version SET state = 'published' WHERE floor_id = :f"), {"f": floor}
    )
    await db.execute(text("UPDATE floor SET published_version = 1 WHERE id = :f"), {"f": floor})

    result = await apply(
        ctx,
        0,  # no draft any more: the next changeset starts draft v2
        {"op": "update", "kind": "object", "id": str(desk), "data": {"position": [3000, 1000, 0]}},
        {"op": "delete", "kind": "wall", "id": str(w)},
        add("object", new_desk, **desk_data(ctx, x=5000)),
    )
    assert (result.version, result.revision) == (2, 1)
    assert result.cascaded == [{"kind": "opening", "id": str(door)}]

    v1, v2 = await plan(ctx, 1), await plan(ctx, 2)
    assert (len(v1.walls), len(v1.openings), v1.objects[0].position) == (
        1,
        1,
        (1000, 1000, 0),
    )  # untouched
    assert (len(v2.walls), len(v2.openings)) == (0, 0)
    assert {o.id: o.position for o in v2.objects} == {
        desk: (3000, 1000, 0),
        new_desk: (5000, 1000, 0),
    }
    assert (
        await count(ctx, models.ObjectRev, desk) == 2
    )  # v1 revision closed at 2, v2 revision opened
    assert await count(ctx, models.WallRev, w) == 1  # closed, not deleted: v1 still needs it


async def test_added_then_deleted_in_the_same_draft_leaves_no_trace(ctx: dict[str, Any]) -> None:
    w = new_id()
    await apply(ctx, 0, add("wall", w, **wall_data()))
    await apply(ctx, 1, {"op": "delete", "kind": "wall", "id": str(w)})
    assert await ctx["db"].get(models.FloorElement, w) is None


async def test_stale_revision_and_lock_rules(ctx: dict[str, Any]) -> None:
    await apply(ctx, 0, add("wall", new_id(), **wall_data()))
    with pytest.raises(ProblemException) as exc:
        await apply(ctx, 0, add("wall", new_id(), **wall_data()))  # draft is at revision 1
    assert (exc.value.status, exc.value.slug) == (409, "stale-revision")

    bob = Principal("bob", "Bob", None, frozenset({ADMIN_ROLE}), ctx["tenant"], new_id(), "c")
    with pytest.raises(ProblemException) as exc:
        await apply(ctx, 1, add("wall", new_id(), **wall_data()), who=bob)
    assert (exc.value.status, exc.value.slug) == (423, "floor-locked")

    await ctx["db"].execute(
        text("DELETE FROM floor_edit_lock WHERE floor_id = :f"), {"f": ctx["floor"]}
    )
    with pytest.raises(ProblemException) as exc:
        await apply(ctx, 1, add("wall", new_id(), **wall_data()))
    assert (exc.value.status, exc.value.slug) == (409, "lock-required")


async def test_invalid_changeset_saves_nothing(ctx: dict[str, Any]) -> None:
    w = new_id()
    with pytest.raises(ProblemException) as exc:
        await apply(
            ctx,
            0,
            add("wall", w, **wall_data()),
            add(
                "opening",
                new_id(),
                wall_id=str(w),
                type="door",
                offset_mm=5500,
                width_mm=900,
                height_mm=2100,
                swing="none",
            ),
        )
    assert (exc.value.status, exc.value.slug) == (422, "changeset-invalid")
    assert exc.value.errors is not None and exc.value.errors[0].code == "opening_exceeds_wall"
    await ctx["db"].rollback()  # what the request's session does when the handler raises
    assert await ctx["db"].get(models.FloorElement, w) is None


async def test_ids_are_never_reused(ctx: dict[str, Any]) -> None:
    """An element deleted in a new draft still exists in the published version, so its id is
    permanent: re-adding it is refused (docs/0028)."""
    w = new_id()
    await apply(ctx, 0, add("wall", w, **wall_data()))
    await ctx["db"].execute(
        text("UPDATE floor_version SET state = 'published' WHERE floor_id = :f"),
        {"f": ctx["floor"]},
    )
    await ctx["db"].execute(
        text("UPDATE floor SET published_version = 1 WHERE id = :f"), {"f": ctx["floor"]}
    )
    await apply(ctx, 0, {"op": "delete", "kind": "wall", "id": str(w)})  # draft v2
    with pytest.raises(ProblemException) as exc:
        await apply(ctx, 1, add("wall", w, **wall_data()))
    assert exc.value.errors is not None
    assert (exc.value.errors[0].code, exc.value.errors[0].op_index) == ("duplicate_id", 0)
