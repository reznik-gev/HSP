"""Zone types and catalog items (docs/0020, 0021, 0083).

The logic here is mostly queries (latest revision, "is it in use?"), so the services work on an
AsyncSession directly and are tested against PostgreSQL rather than an in-memory fake.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from hsp import models
from hsp.audit import audit_event, changed_fields
from hsp.auth.principal import Principal
from hsp.problems import ProblemException

Slug = Annotated[str, Field(pattern=r"^[a-z][a-z0-9_]*$", max_length=50)]
Mm = Annotated[int, Field(gt=0, le=100_000)]
Color = Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")]

# --- Zone types -----------------------------------------------------------------------------


class ZoneTypeIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    is_enclosed: bool = False
    color: Color | None = None


class ZoneTypePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    is_enclosed: bool | None = None
    color: Color | None = None


class ZoneTypeOut(BaseModel):
    id: uuid.UUID
    name: str
    is_enclosed: bool
    color: str | None


# --- Catalog items --------------------------------------------------------------------------

REVISION_FIELDS = (
    "shape",
    "width_mm",
    "depth_mm",
    "height_mm",
    "color",
    "is_seat",
    "mountable",
    "attaches_to_categories",
    "footprint_blocks",
)


class RevisionOut(BaseModel):
    id: uuid.UUID
    rev_no: int
    shape: str
    width_mm: int
    depth_mm: int
    height_mm: int
    color: str | None
    model_key: str | None
    is_seat: bool
    mountable: bool
    attaches_to_categories: list[str]
    footprint_blocks: bool


class CatalogItemOut(BaseModel):
    id: uuid.UUID
    key: str
    category: str
    name: str
    builtin: bool = Field(description="Shipped with HSP; read-only (docs/0083)")
    archived_at: datetime | None
    current_revision: RevisionOut


class CatalogItemIn(BaseModel):
    key: Slug
    category: Slug
    name: str = Field(min_length=1, max_length=200)
    shape: Literal["box", "cylinder", "l_shape"] = "box"  # no uploaded models in v1 (docs/0083)
    width_mm: Mm
    depth_mm: Mm
    height_mm: Mm
    color: Color | None = None
    is_seat: bool = False
    mountable: bool = False
    attaches_to_categories: list[Slug] = []
    footprint_blocks: bool = True


class CatalogItemPatch(BaseModel):
    category: Slug | None = None
    name: str | None = Field(default=None, min_length=1, max_length=200)
    shape: Literal["box", "cylinder", "l_shape"] | None = None
    width_mm: Mm | None = None
    depth_mm: Mm | None = None
    height_mm: Mm | None = None
    color: Color | None = None
    is_seat: bool | None = None
    mountable: bool | None = None
    attaches_to_categories: list[Slug] | None = None
    footprint_blocks: bool | None = None


def _rev_out(r: models.CatalogItemRev) -> RevisionOut:
    return RevisionOut(
        id=r.id,
        rev_no=r.rev_no,
        shape=r.shape.value,
        width_mm=r.width_mm,
        depth_mm=r.depth_mm,
        height_mm=r.height_mm,
        color=r.color,
        model_key=r.model_key,
        is_seat=r.is_seat,
        mountable=r.mountable,
        attaches_to_categories=list(r.attaches_to_categories),
        footprint_blocks=r.footprint_blocks,
    )


def _item_out(item: models.CatalogItem, rev: models.CatalogItemRev) -> CatalogItemOut:
    return CatalogItemOut(
        id=item.id,
        key=item.key,
        category=item.category,
        name=item.name,
        builtin=item.tenant_id is None,
        archived_at=item.archived_at,
        current_revision=_rev_out(rev),
    )


def _rev_snapshot(r: models.CatalogItemRev) -> dict[str, Any]:
    return {f: (r.shape.value if f == "shape" else getattr(r, f)) for f in REVISION_FIELDS}


@dataclass
class CatalogService:
    db: AsyncSession
    principal: Principal
    request_id: str | None = None

    @property
    def _tenant(self) -> uuid.UUID:
        return self.principal.tenant_id

    def _audit(
        self,
        action: str,
        entity_type: str,
        entity_id: uuid.UUID,
        before: Any = None,
        after: Any = None,
    ) -> None:
        self.db.add(
            audit_event(
                self.principal,
                action=action,
                entity_type=entity_type,
                entity_id=entity_id,
                before=before,
                after=after,
                request_id=self.request_id,
            )
        )

    # Zone types ------------------------------------------------------------------------------

    async def list_zone_types(self) -> list[ZoneTypeOut]:
        rows = await self.db.scalars(
            select(models.ZoneType)
            .where(models.ZoneType.tenant_id == self._tenant)
            .order_by(models.ZoneType.name)
        )
        return [
            ZoneTypeOut(id=z.id, name=z.name, is_enclosed=z.is_enclosed, color=z.color)
            for z in rows
        ]

    async def _zone_type(self, zone_type_id: uuid.UUID) -> models.ZoneType:
        z = await self.db.scalar(
            select(models.ZoneType).where(
                models.ZoneType.tenant_id == self._tenant, models.ZoneType.id == zone_type_id
            )
        )
        if z is None:
            raise ProblemException(
                404, "not-found", "Not found", f"Zone type {zone_type_id} does not exist."
            )
        return z

    async def _ensure_zone_type_name_free(self, name: str, own: uuid.UUID | None) -> None:
        clash = await self.db.scalar(
            select(models.ZoneType.id).where(
                models.ZoneType.tenant_id == self._tenant,
                func.lower(models.ZoneType.name) == name.lower(),
            )
        )
        if clash is not None and clash != own:
            raise ProblemException(
                409, "name-taken", "Name already used", f"A zone type called {name!r} exists."
            )

    async def create_zone_type(self, body: ZoneTypeIn) -> ZoneTypeOut:
        await self._ensure_zone_type_name_free(body.name, None)
        now = datetime.now(UTC)
        z = models.ZoneType(
            id=models.new_id(),
            tenant_id=self._tenant,
            created_at=now,
            updated_at=now,
            **body.model_dump(),
        )
        self.db.add(z)
        self._audit("zone_type.created", "zone_type", z.id, after=body.model_dump())
        await self.db.commit()
        return ZoneTypeOut(id=z.id, name=z.name, is_enclosed=z.is_enclosed, color=z.color)

    async def update_zone_type(
        self, zone_type_id: uuid.UUID, changes: dict[str, Any]
    ) -> ZoneTypeOut:
        z = await self._zone_type(zone_type_id)
        if "name" in changes:
            await self._ensure_zone_type_name_free(changes["name"], z.id)
        before = {"name": z.name, "is_enclosed": z.is_enclosed, "color": z.color}
        for k, v in changes.items():
            setattr(z, k, v)
        b, a = changed_fields(
            before, {"name": z.name, "is_enclosed": z.is_enclosed, "color": z.color}
        )
        if a:
            z.updated_at = datetime.now(UTC)
            self._audit("zone_type.updated", "zone_type", z.id, b, a)
            await self.db.commit()
        return ZoneTypeOut(id=z.id, name=z.name, is_enclosed=z.is_enclosed, color=z.color)

    async def delete_zone_type(self, zone_type_id: uuid.UUID) -> None:
        z = await self._zone_type(zone_type_id)
        used = await self.db.scalar(
            select(models.ZoneRev.id).where(models.ZoneRev.zone_type_id == z.id).limit(1)
        )
        if used is not None:
            raise ProblemException(
                409,
                "in-use",
                "Zone type in use",
                "Zones in floor plans (current or past versions) use this type.",
            )
        await self.db.delete(z)
        self._audit("zone_type.deleted", "zone_type", z.id, before={"name": z.name})
        await self.db.commit()

    # Catalog items ---------------------------------------------------------------------------

    def _visible(self) -> Any:
        return or_(
            models.CatalogItem.tenant_id.is_(None), models.CatalogItem.tenant_id == self._tenant
        )

    async def _latest(self, item_id: uuid.UUID) -> models.CatalogItemRev:
        rev = await self.db.scalar(
            select(models.CatalogItemRev)
            .where(models.CatalogItemRev.item_id == item_id)
            .order_by(models.CatalogItemRev.rev_no.desc())
            .limit(1)
        )
        assert rev is not None  # every item is created with revision 1
        return rev

    async def _item(self, item_id: uuid.UUID) -> models.CatalogItem:
        item = await self.db.scalar(
            select(models.CatalogItem).where(models.CatalogItem.id == item_id, self._visible())
        )
        if item is None:
            raise ProblemException(
                404, "not-found", "Not found", f"Catalog item {item_id} does not exist."
            )
        return item

    async def _custom(self, item_id: uuid.UUID) -> models.CatalogItem:
        item = await self._item(item_id)
        if item.tenant_id is None:
            raise ProblemException(
                409,
                "builtin-read-only",
                "Built-in item",
                "Built-in catalog items are read-only; create a custom item instead (docs/0083).",
            )
        return item

    async def list_items(
        self, *, category: str | None, include_archived: bool, after: uuid.UUID | None, limit: int
    ) -> list[CatalogItemOut]:
        latest = (
            select(
                models.CatalogItemRev.item_id,
                func.max(models.CatalogItemRev.rev_no).label("rev_no"),
            )
            .group_by(models.CatalogItemRev.item_id)
            .subquery()
        )
        q = (
            select(models.CatalogItem, models.CatalogItemRev)
            .join(latest, latest.c.item_id == models.CatalogItem.id)
            .join(
                models.CatalogItemRev,
                (models.CatalogItemRev.item_id == latest.c.item_id)
                & (models.CatalogItemRev.rev_no == latest.c.rev_no),
            )
            .where(self._visible())
        )
        if category is not None:
            q = q.where(models.CatalogItem.category == category)
        if not include_archived:
            q = q.where(models.CatalogItem.archived_at.is_(None))
        if after is not None:
            q = q.where(models.CatalogItem.id > after)
        rows = await self.db.execute(q.order_by(models.CatalogItem.id).limit(limit))
        return [_item_out(item, rev) for item, rev in rows]

    async def get_item(self, item_id: uuid.UUID) -> CatalogItemOut:
        item = await self._item(item_id)
        return _item_out(item, await self._latest(item.id))

    async def revisions(self, item_id: uuid.UUID) -> list[RevisionOut]:
        item = await self._item(item_id)
        rows = await self.db.scalars(
            select(models.CatalogItemRev)
            .where(models.CatalogItemRev.item_id == item.id)
            .order_by(models.CatalogItemRev.rev_no)
        )
        return [_rev_out(r) for r in rows]

    async def create_item(self, body: CatalogItemIn) -> CatalogItemOut:
        taken = await self.db.scalar(
            select(models.CatalogItem.id).where(models.CatalogItem.key == body.key, self._visible())
        )
        if taken is not None:
            raise ProblemException(
                409,
                "key-taken",
                "Key already used",
                f"A catalog item with key {body.key!r} exists.",
            )
        now = datetime.now(UTC)
        item = models.CatalogItem(
            id=models.new_id(),
            tenant_id=self._tenant,
            key=body.key,
            category=body.category,
            name=body.name,
            created_at=now,
            updated_at=now,
            archived_at=None,
        )
        self.db.add(item)
        await self.db.flush()  # no ORM relationships: the item must exist before its revision
        rev = models.CatalogItemRev(
            id=models.new_id(),
            tenant_id=self._tenant,
            item_id=item.id,
            rev_no=1,
            shape=models.CatalogShape(body.shape),
            **body.model_dump(include=set(REVISION_FIELDS) - {"shape"}),
        )
        self.db.add(rev)
        self._audit("catalog_item.created", "catalog_item", item.id, after=body.model_dump())
        await self.db.commit()
        return _item_out(item, rev)

    async def update_item(self, item_id: uuid.UUID, changes: dict[str, Any]) -> CatalogItemOut:
        item = await self._custom(item_id)
        if item.archived_at is not None:
            raise ProblemException(
                409, "archived", "Archived", "Restore the item before editing it (docs/0078)."
            )
        rev = await self._latest(item.id)
        before_item = {"category": item.category, "name": item.name}
        for k in ("category", "name"):
            if k in changes:
                setattr(item, k, changes[k])
        b_item, a_item = changed_fields(before_item, {"category": item.category, "name": item.name})
        old = _rev_snapshot(rev)
        new = old | {k: v for k, v in changes.items() if k in REVISION_FIELDS}
        b_rev, a_rev = changed_fields(old, new)
        if a_rev:  # shape/dimensions/flags changed: a new revision (docs/0021)
            rev = models.CatalogItemRev(
                id=models.new_id(),
                tenant_id=self._tenant,
                item_id=item.id,
                rev_no=rev.rev_no + 1,
                shape=models.CatalogShape(new["shape"]),
                model_key=None,
                **{k: new[k] for k in REVISION_FIELDS if k != "shape"},
            )
            self.db.add(rev)
        if a_item or a_rev:
            item.updated_at = datetime.now(UTC)
            self._audit(
                "catalog_item.updated",
                "catalog_item",
                item.id,
                b_item | b_rev,
                a_item | a_rev | ({"rev_no": rev.rev_no} if a_rev else {}),
            )
            await self.db.commit()
        return _item_out(item, rev)

    async def archive_item(self, item_id: uuid.UUID) -> None:
        item = await self._custom(item_id)
        if item.archived_at is None:
            item.archived_at = item.updated_at = datetime.now(UTC)
            self._audit(
                "catalog_item.archived",
                "catalog_item",
                item.id,
                after={"archived_at": item.archived_at},
            )
            await self.db.commit()

    async def restore_item(self, item_id: uuid.UUID) -> CatalogItemOut:
        item = await self._custom(item_id)
        if item.archived_at is not None:
            before = item.archived_at
            item.archived_at = None
            item.updated_at = datetime.now(UTC)
            self._audit(
                "catalog_item.restored",
                "catalog_item",
                item.id,
                {"archived_at": before},
                {"archived_at": None},
            )
            await self.db.commit()
        return _item_out(item, await self._latest(item.id))
