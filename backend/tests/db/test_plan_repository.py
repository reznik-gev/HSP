"""SqlPlanRepository against PostGIS: version-range visibility (docs/0028, docs/0061 item 2),
geometry conversion to integer mm, embedded catalog."""

import uuid
from datetime import UTC, datetime

from geoalchemy2.elements import WKTElement
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession

from hsp import models
from hsp.models import new_id
from hsp.plans.repository import SqlPlanRepository


async def _setup(db: AsyncSession) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
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
        code="B",
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
        published_version=2,
    )
    # No ORM relationships are declared, so flush parents before children (FK order).
    for row in (site, building, floor):
        db.add(row)
        await db.flush()
    for n, state in (
        (1, models.FloorVersionState.SUPERSEDED),
        (2, models.FloorVersionState.PUBLISHED),
        (3, models.FloorVersionState.DRAFT),
    ):
        db.add(
            models.FloorVersion(
                id=new_id(),
                tenant_id=tenant,
                floor_id=floor.id,
                version_no=n,
                state=state,
                revision=n,
                created_by="admin",
            )
        )
    desk_rev = await db.scalar(
        select(models.CatalogItemRev.id)
        .join(models.CatalogItem)
        .where(models.CatalogItem.key == "desk_1600x800")
    )
    assert desk_rev is not None
    return tenant, floor.id, desk_rev


def _element(
    db: AsyncSession, tenant: uuid.UUID, floor_id: uuid.UUID, kind: models.ElementKind
) -> uuid.UUID:
    e = models.FloorElement(id=new_id(), tenant_id=tenant, floor_id=floor_id, kind=kind)
    db.add(e)
    return e.id


async def test_version_ranges_and_geometry(conn: AsyncConnection) -> None:
    db = AsyncSession(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False)
    tenant, floor_id, desk_rev = await _setup(db)

    # A wall present in every version; a zone added in v2; a desk moved in v3 (draft).
    wall = _element(db, tenant, floor_id, models.ElementKind.WALL)
    zone = _element(db, tenant, floor_id, models.ElementKind.ZONE)
    desk = _element(db, tenant, floor_id, models.ElementKind.OBJECT)
    zone_type = (
        await db.execute(
            text("SELECT id FROM zone_type WHERE tenant_id = :t LIMIT 1"), {"t": tenant}
        )
    ).scalar_one()
    await db.flush()
    db.add_all(
        [
            models.WallRev(
                id=new_id(),
                tenant_id=tenant,
                element_id=wall,
                from_version=1,
                to_version=None,
                centerline=WKTElement("LINESTRING(0 0, 12000 0)"),
                thickness_mm=150,
                height_mm=2800,
            ),
            models.ZoneRev(
                id=new_id(),
                tenant_id=tenant,
                element_id=zone,
                from_version=2,
                to_version=None,
                name="Pod A",
                zone_type_id=zone_type,
                parent_zone_element_id=None,
                boundary=WKTElement("POLYGON((0 0, 4000 0, 4000 3000, 0 3000, 0 0))"),
            ),
            models.ObjectRev(
                id=new_id(),
                tenant_id=tenant,
                element_id=desk,
                from_version=1,
                to_version=3,
                catalog_item_rev_id=desk_rev,
                position=WKTElement("POINT Z (1000 1000 0)"),
                rotation_ddeg=0,
                label="D1",
                allocation_mode=models.AllocationMode.ASSIGNED,
            ),
            models.ObjectRev(
                id=new_id(),
                tenant_id=tenant,
                element_id=desk,
                from_version=3,
                to_version=None,
                catalog_item_rev_id=desk_rev,
                position=WKTElement("POINT Z (1500 1000 0)"),
                rotation_ddeg=900,
                label="D1",
                allocation_mode=models.AllocationMode.ASSIGNED,
            ),
        ]
    )
    await db.flush()
    repo = SqlPlanRepository(db)

    v1 = await repo.load_content(tenant, floor_id, 1)
    v2 = await repo.load_content(tenant, floor_id, 2)
    v3 = await repo.load_content(tenant, floor_id, 3)
    assert [len(v.zones) for v in (v1, v2, v3)] == [0, 1, 1]
    assert v1.walls[0].a == (0, 0) and v1.walls[0].b == (12000, 0)
    assert v2.zones[0].boundary == [
        (0, 0),
        (4000, 0),
        (4000, 3000),
        (0, 3000),
    ]  # no repeated vertex
    assert v2.objects[0].position == (1000, 1000, 0)  # old revision still valid in v2
    assert (v3.objects[0].position, v3.objects[0].rotation_ddeg) == ((1500, 1000, 0), 900)
    assert v3.objects[0].id == v2.objects[0].id == desk  # stable identity across versions
    assert v3.catalog[str(desk_rev)].key == "desk_1600x800"
    assert v3.catalog[str(desk_rev)].is_seat is True

    versions = await repo.list_versions(tenant, floor_id)
    assert [(v.version, v.state) for v in versions] == [
        (1, "superseded"),
        (2, "published"),
        (3, "draft"),
    ]
    assert await repo.floor_exists(tenant, floor_id)
    assert not await repo.floor_exists(new_id(), floor_id)  # tenant scoping
