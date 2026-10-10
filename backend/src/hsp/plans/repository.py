"""Reading floor plans (docs/0028). Services depend on the `PlanRepository` protocol; unit tests
use an in-memory fake (docs/0061). Every query is tenant-scoped (docs/0003).

A revision row is visible in version v iff
    from_version <= v AND (to_version IS NULL OR v < to_version).
"""

import uuid
from typing import Any, Protocol

from geoalchemy2.shape import to_shape
from sqlalchemy import ColumnElement, and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from hsp import models
from hsp.plans.schema import (
    CatalogItem,
    Column,
    FloorVersion,
    Opening,
    PlacedObject,
    PlanContent,
    Point2,
    Wall,
    Zone,
)


class PlanRepository(Protocol):
    async def floor_exists(self, tenant_id: uuid.UUID, floor_id: uuid.UUID) -> bool: ...

    async def list_versions(self, tenant_id: uuid.UUID, floor_id: uuid.UUID) -> list[FloorVersion]:
        """All versions of the floor, oldest first."""
        ...

    async def load_content(
        self, tenant_id: uuid.UUID, floor_id: uuid.UUID, version: int
    ) -> PlanContent:
        """Every element visible in `version`, plus the catalog revisions they use."""
        ...


def visible_in(rev: Any, version: int) -> ColumnElement[bool]:
    return and_(
        rev.from_version <= version,
        or_(rev.to_version.is_(None), rev.to_version > version),
    )


def _points(geom: Any) -> list[Point2]:
    shape = to_shape(geom)
    coords = list(shape.exterior.coords if hasattr(shape, "exterior") else shape.coords)
    if len(coords) > 1 and coords[0] == coords[-1]:
        coords = coords[:-1]  # polygons repeat their first vertex; the API doesn't (docs/0036)
    return [(round(c[0]), round(c[1])) for c in coords]


class SqlPlanRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def floor_exists(self, tenant_id: uuid.UUID, floor_id: uuid.UUID) -> bool:
        found = await self._db.scalar(
            select(models.Floor.id).where(
                models.Floor.tenant_id == tenant_id, models.Floor.id == floor_id
            )
        )
        return found is not None

    async def list_versions(self, tenant_id: uuid.UUID, floor_id: uuid.UUID) -> list[FloorVersion]:
        rows = await self._db.scalars(
            select(models.FloorVersion)
            .where(
                models.FloorVersion.tenant_id == tenant_id,
                models.FloorVersion.floor_id == floor_id,
            )
            .order_by(models.FloorVersion.version_no)
        )
        return [
            FloorVersion(
                version=r.version_no,
                state=r.state.value,
                revision=r.revision,
                created_by=r.created_by,
                created_at=r.created_at,
                published_by=r.published_by,
                published_at=r.published_at,
                note=r.note,
            )
            for r in rows
        ]

    async def _revisions(
        self, rev: Any, tenant_id: uuid.UUID, floor_id: uuid.UUID, version: int
    ) -> list[Any]:
        q = (
            select(rev)
            .join(models.FloorElement, models.FloorElement.id == rev.element_id)
            .where(
                rev.tenant_id == tenant_id,
                models.FloorElement.floor_id == floor_id,
                visible_in(rev, version),
            )
            .order_by(rev.element_id)
        )
        return list(await self._db.scalars(q))

    async def load_content(
        self, tenant_id: uuid.UUID, floor_id: uuid.UUID, version: int
    ) -> PlanContent:
        args = (tenant_id, floor_id, version)
        walls = [
            Wall(
                id=r.element_id,
                a=(pts := _points(r.centerline))[0],
                b=pts[1],
                thickness_mm=r.thickness_mm,
                height_mm=r.height_mm,
            )
            for r in await self._revisions(models.WallRev, *args)
        ]
        openings = [
            Opening(
                id=r.element_id,
                wall_id=r.wall_element_id,
                type=r.opening_type.value,
                offset_mm=r.offset_mm,
                width_mm=r.width_mm,
                height_mm=r.height_mm,
                sill_mm=r.sill_mm,
                swing=r.swing.value,
            )
            for r in await self._revisions(models.OpeningRev, *args)
        ]
        columns = [
            Column(id=r.element_id, footprint=_points(r.footprint), height_mm=r.height_mm)
            for r in await self._revisions(models.ColumnRev, *args)
        ]
        zones = [
            Zone(
                id=r.element_id,
                name=r.name,
                zone_type_id=r.zone_type_id,
                parent_zone_id=r.parent_zone_element_id,
                boundary=_points(r.boundary),
            )
            for r in await self._revisions(models.ZoneRev, *args)
        ]
        objects = []
        for r in await self._revisions(models.ObjectRev, *args):
            p = to_shape(r.position)
            objects.append(
                PlacedObject(
                    id=r.element_id,
                    catalog_item_rev_id=r.catalog_item_rev_id,
                    position=(round(p.x), round(p.y), round(p.z)),
                    rotation_ddeg=r.rotation_ddeg,
                    label=r.label,
                    attached_to=r.attached_to_element_id,
                    device_id=r.device_id,
                    allocation_mode=r.allocation_mode.value if r.allocation_mode else None,
                )
            )
        return PlanContent(
            walls=walls,
            openings=openings,
            columns=columns,
            zones=zones,
            objects=objects,
            catalog=await self._catalog({o.catalog_item_rev_id for o in objects}),
        )

    async def _catalog(self, rev_ids: set[uuid.UUID]) -> dict[str, CatalogItem]:
        if not rev_ids:
            return {}
        rows = await self._db.execute(
            select(models.CatalogItemRev, models.CatalogItem)
            .join(models.CatalogItem, models.CatalogItem.id == models.CatalogItemRev.item_id)
            .where(models.CatalogItemRev.id.in_(rev_ids))
        )
        return {
            str(rev.id): CatalogItem(
                id=rev.id,
                item_id=item.id,
                key=item.key,
                category=item.category,
                name=item.name,
                shape=rev.shape.value,
                width_mm=rev.width_mm,
                depth_mm=rev.depth_mm,
                height_mm=rev.height_mm,
                color=rev.color,
                is_seat=rev.is_seat,
                mountable=rev.mountable,
                attaches_to_categories=list(rev.attaches_to_categories),
                footprint_blocks=rev.footprint_blocks,
            )
            for rev, item in rows
        }
