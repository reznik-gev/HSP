"""Devices against PostgreSQL: unique asset tags, search, placement lookup, in-use (docs/0022)."""

from typing import Any

import pytest

from hsp.catalog.devices import DeviceIn, DevicesService
from hsp.models import new_id
from hsp.plans.drafts import SqlDraftRepository
from hsp.plans.publishing import PublishIn, PublishingService, SqlPublishRepository
from hsp.problems import ProblemException
from tests.db.plan_helpers import add, apply, stub_desk


def devices_service(admin_editing_new_floor: dict[str, Any]) -> DevicesService:
    return DevicesService(admin_editing_new_floor["db"], admin_editing_new_floor["admin"])


async def test_create_unique_tag_search_and_unknown_person(
    admin_editing_new_floor: dict[str, Any],
) -> None:
    s = devices_service(admin_editing_new_floor)
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


async def test_placement_follows_the_published_plan_and_blocks_delete(
    admin_editing_new_floor: dict[str, Any],
) -> None:
    s = devices_service(admin_editing_new_floor)
    d = await s.create(DeviceIn(asset_tag=f"MON-{new_id().hex[:6]}"))
    desk = new_id()
    await apply(
        admin_editing_new_floor,
        0,
        add("object", desk, **stub_desk(admin_editing_new_floor, device_id=str(d.id))),
    )
    assert (await s.get(d.id)).placement is None  # only a draft so far
    await PublishingService(
        SqlDraftRepository(admin_editing_new_floor["db"]),
        SqlPublishRepository(admin_editing_new_floor["db"]),
        admin_editing_new_floor["admin"],
    ).publish(admin_editing_new_floor["floor"], PublishIn(base_revision=1))
    placed = (await s.get(d.id)).placement
    assert placed is not None
    assert (placed.floor_id, placed.element_id, placed.version) == (
        admin_editing_new_floor["floor"],
        desk,
        1,
    )
    with pytest.raises(ProblemException) as exc:
        await s.delete(d.id)
    assert exc.value.slug == "in-use"


async def test_filter_by_placed_and_issued(admin_editing_new_floor: dict[str, Any]) -> None:
    s = devices_service(admin_editing_new_floor)
    tag = f"F-{new_id().hex[:6]}"
    placed = await s.create(DeviceIn(asset_tag=f"{tag}-placed"))
    loose = await s.create(DeviceIn(asset_tag=f"{tag}-loose"))
    await apply(
        admin_editing_new_floor,
        0,
        add("object", new_id(), **stub_desk(admin_editing_new_floor, device_id=str(placed.id))),
    )
    await PublishingService(
        SqlDraftRepository(admin_editing_new_floor["db"]),
        SqlPublishRepository(admin_editing_new_floor["db"]),
        admin_editing_new_floor["admin"],
    ).publish(admin_editing_new_floor["floor"], PublishIn(base_revision=1))

    async def ids(**filters: Any) -> set[Any]:
        rows = await s.list(q=tag, assigned_person_id=None, after=None, limit=10, **filters)
        return {d.id for d in rows}

    assert await ids(placed=True) == {placed.id}
    assert await ids(placed=False) == {loose.id}
    assert await ids(issued=True) == set()
    assert await ids(issued=False) == {placed.id, loose.id}


async def test_unplaced_device_can_be_deleted_and_patch_audits_changes(
    admin_editing_new_floor: dict[str, Any],
) -> None:
    s = devices_service(admin_editing_new_floor)
    d = await s.create(DeviceIn(asset_tag=f"DOCK-{new_id().hex[:6]}"))
    updated = await s.update(d.id, {"notes": "Desk 3-B-12"})
    assert updated.notes == "Desk 3-B-12"
    await s.delete(d.id)
    with pytest.raises(ProblemException) as exc:
        await s.get(d.id)
    assert exc.value.status == 404
