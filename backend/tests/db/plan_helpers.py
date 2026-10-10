"""Shared setup for floor-plan DB tests: a floor, an admin holding its edit lock, catalog ids."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from pydantic import TypeAdapter
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from hsp import models
from hsp.auth.principal import ADMIN_ROLE, Principal
from hsp.models import new_id
from hsp.plans.changeset import ChangesetIn
from hsp.plans.drafts import DraftsService, SqlDraftRepository
from hsp.plans.locks import SqlLockRepository
from hsp.plans.repository import SqlPlanRepository

changeset = TypeAdapter(ChangesetIn)


async def new_tenant(db: AsyncSession) -> uuid.UUID:
    """A fresh tenant, for tests whose rules are per tenant (e.g. the single root unit)."""
    tenant = new_id()
    await db.execute(
        text(
            "INSERT INTO tenant (id, name, slug, created_at, updated_at) "
            "VALUES (:id, 'T', :s, now(), now())"
        ),
        {"id": tenant, "s": f"t-{tenant.hex[:8]}"},
    )
    return tenant


async def make_floor(
    db: AsyncSession, tenant: uuid.UUID, building_id: uuid.UUID | None = None, level: int = 0
) -> tuple[uuid.UUID, uuid.UUID]:
    """Create a floor (and site + building unless given). Returns (floor_id, building_id)."""
    now = datetime.now(UTC)
    if building_id is None:
        site = models.Site(
            id=new_id(),
            tenant_id=tenant,
            name="HQ",
            time_zone="UTC",
            created_at=now,
            updated_at=now,
        )
        db.add(site)
        await db.flush()
        building = models.Building(
            id=new_id(),
            tenant_id=tenant,
            site_id=site.id,
            name="B",
            code=f"B{new_id().hex[:6]}",
            created_at=now,
            updated_at=now,
        )
        db.add(building)
        await db.flush()
        building_id = building.id
    floor = models.Floor(
        id=new_id(),
        tenant_id=tenant,
        building_id=building_id,
        name=f"L{level}",
        level_index=level,
        elevation_mm=0,
        default_wall_height_mm=2800,
        origin_x_mm=0,
        origin_y_mm=0,
        created_at=now,
        updated_at=now,
    )
    db.add(floor)
    await db.flush()
    return floor.id, building_id


async def lock(
    db: AsyncSession, tenant: uuid.UUID, floor_id: uuid.UUID, subject: str = "alice"
) -> None:
    now = datetime.now(UTC)
    await SqlLockRepository(db).try_acquire(
        tenant,
        floor_id,
        subject=subject,
        name=subject.title(),
        now=now,
        expires_at=now + timedelta(minutes=15),
    )


async def context(db: AsyncSession) -> dict[str, Any]:
    tenant = (await db.execute(text("SELECT id FROM tenant WHERE slug = 'default'"))).scalar_one()
    floor, building = await make_floor(db, tenant)
    await lock(db, tenant, floor)
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
    admin = Principal("alice", "Alice", None, frozenset({ADMIN_ROLE}), tenant, new_id(), "c")
    return {
        "db": db,
        "tenant": tenant,
        "floor": floor,
        "building": building,
        "admin": admin,
        "desk_rev": desk_rev,
        "zone_type": zone_type,
    }


async def apply(
    ctx: dict[str, Any], base: int, *ops: dict[str, Any], floor: uuid.UUID | None = None
) -> Any:
    service = DraftsService(SqlDraftRepository(ctx["db"]), ctx["admin"])
    body = changeset.validate_python({"base_revision": base, "ops": list(ops)})
    return await service.apply(floor or ctx["floor"], body)


async def plan(ctx: dict[str, Any], version: int, floor: uuid.UUID | None = None) -> Any:
    return await SqlPlanRepository(ctx["db"]).load_content(
        ctx["tenant"], floor or ctx["floor"], version
    )


def add(kind: str, element_id: uuid.UUID, **data: Any) -> dict[str, Any]:
    return {"op": "add", "kind": kind, "id": str(element_id), "data": data}


def wall_data() -> dict[str, Any]:
    return {"a": [0, 0], "b": [6000, 0], "thickness_mm": 150, "height_mm": 2800}


def desk_data(
    ctx: dict[str, Any], x: int = 1000, label: str | None = "D1", **extra: Any
) -> dict[str, Any]:
    return {
        "catalog_item_rev_id": str(ctx["desk_rev"]),
        "position": [x, 1000, 0],
        "allocation_mode": "assigned",
        "label": label,
        **extra,
    }
