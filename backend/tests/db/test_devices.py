"""Devices against PostgreSQL: unique asset tags, search, placement lookup, in-use (docs/0022)."""

from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession

from hsp.catalog.devices import DeviceIn, DevicesService
from hsp.models import new_id
from hsp.plans.drafts import SqlDraftRepository
from hsp.plans.publishing import PublishIn, PublishingService, SqlPublishRepository
from hsp.problems import ProblemException
from tests.db.plan_helpers import add, apply, context, desk_data


@pytest.fixture
async def ctx(conn: AsyncConnection) -> dict[str, Any]:
    return await context(
        AsyncSession(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False)
    )


def svc(ctx: dict[str, Any]) -> DevicesService:
    return DevicesService(ctx["db"], ctx["admin"])


async def test_create_unique_tag_search_and_unknown_person(ctx: dict[str, Any]) -> None:
    s = svc(ctx)
    tag = f"MON-{new_id().hex[:6]}"
    d = await s.create(DeviceIn(asset_tag=tag, serial_number="SN-123"))
    assert d.placement is None
    with pytest.raises(ProblemException) as exc:
        await s.create(DeviceIn(asset_tag=tag))
    assert exc.value.slug == "asset-tag-taken"
    found = await s.list(
        q=tag.lower()[:7], assigned_person_id=None, after=None, limit=10
    )  # case-insensitive
    assert d.id in {x.id for x in found}
    assert d.id in {
        x.id for x in await s.list(q="sn-1", assigned_person_id=None, after=None, limit=10)
    }
    with pytest.raises(ProblemException) as exc:
        await s.update(d.id, {"assigned_person_id": new_id()})
    assert exc.value.errors is not None and exc.value.errors[0].pointer == "/assigned_person_id"


async def test_placement_follows_the_published_plan_and_blocks_delete(ctx: dict[str, Any]) -> None:
    s = svc(ctx)
    d = await s.create(DeviceIn(asset_tag=f"MON-{new_id().hex[:6]}"))
    desk = new_id()
    await apply(ctx, 0, add("object", desk, **desk_data(ctx, device_id=str(d.id))))
    assert (await s.get(d.id)).placement is None  # only a draft so far
    await PublishingService(
        SqlDraftRepository(ctx["db"]), SqlPublishRepository(ctx["db"]), ctx["admin"]
    ).publish(ctx["floor"], PublishIn(base_revision=1))
    placed = (await s.get(d.id)).placement
    assert placed is not None
    assert (placed.floor_id, placed.element_id, placed.version) == (ctx["floor"], desk, 1)
    with pytest.raises(ProblemException) as exc:
        await s.delete(d.id)
    assert exc.value.slug == "in-use"


async def test_unplaced_device_can_be_deleted_and_patch_audits_changes(ctx: dict[str, Any]) -> None:
    s = svc(ctx)
    d = await s.create(DeviceIn(asset_tag=f"DOCK-{new_id().hex[:6]}"))
    updated = await s.update(d.id, {"notes": "Desk 3-B-12"})
    assert updated.notes == "Desk 3-B-12"
    await s.delete(d.id)
    with pytest.raises(ProblemException) as exc:
        await s.get(d.id)
    assert exc.value.status == 404
