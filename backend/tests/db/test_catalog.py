"""Zone types and catalog items against PostgreSQL (docs/0021, docs/0083)."""

from typing import Any

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession

from hsp.auth.principal import ADMIN_ROLE, Principal
from hsp.catalog.items import CatalogItemIn, CatalogService, ZoneTypeIn
from hsp.models import new_id
from hsp.problems import ProblemException
from tests.db.plan_helpers import add, apply, context


@pytest.fixture
async def ctx(conn: AsyncConnection) -> dict[str, Any]:
    return await context(
        AsyncSession(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False)
    )


def svc(ctx: dict[str, Any]) -> CatalogService:
    return CatalogService(ctx["db"], ctx["admin"])


def lamp(**over: Any) -> CatalogItemIn:
    return CatalogItemIn.model_validate(
        {
            "key": "floor_lamp",
            "category": "decor",
            "name": "Floor lamp",
            "width_mm": 400,
            "depth_mm": 400,
            "height_mm": 1700,
            **over,
        }
    )


async def test_zone_type_lifecycle_and_in_use(ctx: dict[str, Any]) -> None:
    s = svc(ctx)
    z = await s.create_zone_type(ZoneTypeIn(name="Quiet area", is_enclosed=False, color="#aabbcc"))
    with pytest.raises(ProblemException) as exc:
        await s.create_zone_type(ZoneTypeIn(name="quiet AREA"))
    assert exc.value.slug == "name-taken"  # case-insensitive
    assert (await s.update_zone_type(z.id, {"is_enclosed": True})).is_enclosed is True
    await apply(
        ctx,
        0,
        add(
            "zone",
            new_id(),
            name="Z",
            zone_type_id=str(z.id),
            boundary=[[0, 0], [1000, 0], [1000, 1000]],
        ),
    )
    with pytest.raises(ProblemException) as exc:
        await s.delete_zone_type(z.id)
    assert exc.value.slug == "in-use"
    unused = await s.create_zone_type(ZoneTypeIn(name="Phone booth", is_enclosed=True))
    await s.delete_zone_type(unused.id)
    assert "Phone booth" not in [t.name for t in await s.list_zone_types()]


async def test_builtins_are_listed_and_read_only(ctx: dict[str, Any]) -> None:
    s = svc(ctx)
    desks = await s.list_items(category="desk", include_archived=False, after=None, limit=50)
    assert {d.key for d in desks} >= {"desk_1600x800", "desk_1400x700"}
    assert all(d.builtin for d in desks)
    with pytest.raises(ProblemException) as exc:
        await s.update_item(desks[0].id, {"name": "Mine now"})
    assert exc.value.slug == "builtin-read-only"
    with pytest.raises(ProblemException) as exc:
        await s.create_item(lamp(key="desk_1600x800"))  # can't shadow a built-in key
    assert exc.value.slug == "key-taken"


async def test_dimension_change_adds_a_revision_and_placements_keep_theirs(
    ctx: dict[str, Any],
) -> None:
    s = svc(ctx)
    item = await s.create_item(lamp())
    rev1 = item.current_revision
    assert rev1.rev_no == 1
    renamed = await s.update_item(item.id, {"name": "Arc lamp"})
    assert (renamed.name, renamed.current_revision.id) == ("Arc lamp", rev1.id)  # metadata only
    taller = await s.update_item(item.id, {"height_mm": 1900})
    assert (taller.current_revision.rev_no, taller.current_revision.height_mm) == (2, 1900)
    assert [r.height_mm for r in await s.revisions(item.id)] == [1700, 1900]
    # A placement made with revision 1 still references revision 1 (docs/0021).
    obj = new_id()
    await apply(ctx, 0, add("object", obj, catalog_item_rev_id=str(rev1.id), position=[0, 0, 0]))
    ref = (
        await ctx["db"].execute(
            text("SELECT catalog_item_rev_id FROM object_rev WHERE element_id = :e"), {"e": obj}
        )
    ).scalar_one()
    assert ref == rev1.id


async def test_archive_hides_from_listing_and_blocks_edits(ctx: dict[str, Any]) -> None:
    s = svc(ctx)
    item = await s.create_item(lamp())
    await s.archive_item(item.id)
    assert item.id not in {
        i.id
        for i in await s.list_items(category="decor", include_archived=False, after=None, limit=50)
    }
    assert item.id in {
        i.id
        for i in await s.list_items(category="decor", include_archived=True, after=None, limit=50)
    }
    with pytest.raises(ProblemException) as exc:
        await s.update_item(item.id, {"name": "x"})
    assert exc.value.slug == "archived"
    assert (await s.restore_item(item.id)).archived_at is None


async def test_other_tenants_items_are_invisible(ctx: dict[str, Any]) -> None:
    item = await svc(ctx).create_item(lamp())
    stranger = Principal("x", "X", None, frozenset({ADMIN_ROLE}), new_id(), new_id(), "c")
    with pytest.raises(ProblemException) as exc:
        await CatalogService(ctx["db"], stranger).get_item(item.id)
    assert exc.value.status == 404
