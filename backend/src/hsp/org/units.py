"""Org units and positions (docs/0006, docs/0084). A single tree per tenant; units move, cycles
are refused; archiving follows docs/0078. Tested against PostgreSQL (logic is mostly queries)."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from hsp import models
from hsp.audit import audit_event, changed_fields
from hsp.auth.principal import Principal
from hsp.problems import ProblemError, ProblemException

UNIT_FIELDS = ("name", "parent_id", "level_label", "color", "external_id")


class UnitIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    parent_id: uuid.UUID | None = Field(default=None, description="Null only for the root unit")
    level_label: str | None = Field(default=None, max_length=100)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    external_id: str | None = Field(default=None, max_length=255)


class UnitPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    parent_id: uuid.UUID | None = None
    level_label: str | None = Field(default=None, max_length=100)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    external_id: str | None = Field(default=None, max_length=255)


class UnitOut(BaseModel):
    id: uuid.UUID
    name: str
    parent_id: uuid.UUID | None
    level_label: str | None
    color: str | None
    external_id: str | None
    source: str
    archived_at: datetime | None


class PositionIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class PositionOut(BaseModel):
    id: uuid.UUID
    unit_id: uuid.UUID
    title: str


def unit_out(u: models.OrgUnit) -> UnitOut:
    return UnitOut(
        id=u.id,
        name=u.name,
        parent_id=u.parent_id,
        level_label=u.level_label,
        color=u.color,
        external_id=u.external_id,
        source=u.source.value,
        archived_at=u.archived_at,
    )


def _snapshot(u: models.OrgUnit) -> dict[str, Any]:
    return {f: getattr(u, f) for f in UNIT_FIELDS} | {"archived_at": u.archived_at}


@dataclass
class UnitsService:
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

    async def get_unit(self, unit_id: uuid.UUID) -> models.OrgUnit:
        u = await self.db.scalar(
            select(models.OrgUnit).where(
                models.OrgUnit.tenant_id == self._tenant, models.OrgUnit.id == unit_id
            )
        )
        if u is None:
            raise ProblemException(
                404, "not-found", "Not found", f"Org unit {unit_id} does not exist."
            )
        return u

    async def list_units(
        self, *, include_archived: bool, after: uuid.UUID | None, limit: int
    ) -> list[UnitOut]:
        q = select(models.OrgUnit).where(models.OrgUnit.tenant_id == self._tenant)
        if not include_archived:
            q = q.where(models.OrgUnit.archived_at.is_(None))
        if after is not None:
            q = q.where(models.OrgUnit.id > after)
        return [
            unit_out(u) for u in await self.db.scalars(q.order_by(models.OrgUnit.id).limit(limit))
        ]

    async def _active_parent(self, parent_id: uuid.UUID) -> models.OrgUnit:
        parent = await self.db.scalar(
            select(models.OrgUnit).where(
                models.OrgUnit.tenant_id == self._tenant, models.OrgUnit.id == parent_id
            )
        )
        if parent is None:
            raise ProblemException(
                422,
                "request-invalid",
                "Request validation failed",
                errors=[
                    ProblemError(
                        code="unit_not_found",
                        message=f"Org unit {parent_id} does not exist.",
                        pointer="/parent_id",
                    )
                ],
            )
        if parent.archived_at is not None:
            raise ProblemException(
                409,
                "parent-archived",
                "Parent unit is archived",
                "Restore the parent unit first (docs/0078).",
            )
        return parent

    async def _ensure_external_id_free(
        self, external_id: str | None, own: uuid.UUID | None
    ) -> None:
        if external_id is None:
            return
        clash = await self.db.scalar(
            select(models.OrgUnit.id).where(
                models.OrgUnit.tenant_id == self._tenant, models.OrgUnit.external_id == external_id
            )
        )
        if clash is not None and clash != own:
            raise ProblemException(
                409,
                "external-id-taken",
                "External id already used",
                f"Another unit has external id {external_id!r}.",
            )

    async def _root(self) -> models.OrgUnit | None:
        return await self.db.scalar(
            select(models.OrgUnit).where(
                models.OrgUnit.tenant_id == self._tenant, models.OrgUnit.parent_id.is_(None)
            )
        )

    async def create(
        self, body: UnitIn, source: models.RecordSource = models.RecordSource.MANUAL
    ) -> UnitOut:
        if body.parent_id is None:
            if await self._root() is not None:
                raise ProblemException(
                    409,
                    "root-exists",
                    "Root unit exists",
                    "The organization already has a root unit; choose a parent (docs/0084).",
                )
        else:
            await self._active_parent(body.parent_id)
        await self._ensure_external_id_free(body.external_id, None)
        now = datetime.now(UTC)
        u = models.OrgUnit(
            id=models.new_id(),
            tenant_id=self._tenant,
            source=source,
            created_at=now,
            updated_at=now,
            archived_at=None,
            **body.model_dump(),
        )
        self.db.add(u)
        self._audit("org_unit.created", "org_unit", u.id, after=body.model_dump())
        await self.db.commit()
        return unit_out(u)

    async def _would_cycle(self, unit_id: uuid.UUID, new_parent: uuid.UUID) -> bool:
        cursor: uuid.UUID | None = new_parent
        for _ in range(1000):  # depth guard
            if cursor is None:
                return False
            if cursor == unit_id:
                return True
            cursor = await self.db.scalar(
                select(models.OrgUnit.parent_id).where(models.OrgUnit.id == cursor)
            )
        return True

    async def update(self, unit_id: uuid.UUID, changes: dict[str, Any]) -> UnitOut:
        u = await self.get_unit(unit_id)
        if u.archived_at is not None:
            raise ProblemException(
                409, "archived", "Archived", "Restore the unit before editing it (docs/0078)."
            )
        if "parent_id" in changes and changes["parent_id"] != u.parent_id:
            new_parent = changes["parent_id"]
            if u.parent_id is None or new_parent is None:
                raise ProblemException(
                    409,
                    "root-cannot-move",
                    "Root can't move",
                    "The root unit stays the root; other units can't become a second root.",
                )
            await self._active_parent(new_parent)
            if await self._would_cycle(u.id, new_parent):
                raise ProblemException(
                    409,
                    "unit-cycle",
                    "Would create a cycle",
                    "A unit can't move under itself or one of its own sub-units.",
                )
        if "external_id" in changes:
            await self._ensure_external_id_free(changes["external_id"], u.id)
        before = _snapshot(u)
        for k, v in changes.items():
            if k in UNIT_FIELDS:
                setattr(u, k, v)
        b, a = changed_fields(before, _snapshot(u))
        if a:
            u.updated_at = datetime.now(UTC)
            self._audit(
                "org_unit.moved" if "parent_id" in a else "org_unit.updated", "org_unit", u.id, b, a
            )
            await self.db.commit()
        return unit_out(u)

    async def archive(self, unit_id: uuid.UUID) -> None:
        u = await self.get_unit(unit_id)
        if u.archived_at is not None:
            return
        children = list(
            await self.db.scalars(
                select(models.OrgUnit).where(
                    models.OrgUnit.parent_id == u.id, models.OrgUnit.archived_at.is_(None)
                )
            )
        )
        if children:
            raise ProblemException(
                409,
                "has-active-children",
                "Unit has active sub-units",
                "Archive or move its sub-units first (docs/0078).",
                errors=[
                    ProblemError(code="active_child", message=c.name, element_id=str(c.id))
                    for c in children
                ],
            )
        u.archived_at = u.updated_at = datetime.now(UTC)
        self._audit("org_unit.archived", "org_unit", u.id, after={"archived_at": u.archived_at})
        await self.db.commit()

    async def restore(self, unit_id: uuid.UUID) -> UnitOut:
        u = await self.get_unit(unit_id)
        if u.archived_at is None:
            return unit_out(u)
        if u.parent_id is not None:
            await self._active_parent(u.parent_id)  # top-down (docs/0078)
        before = u.archived_at
        u.archived_at = None
        u.updated_at = datetime.now(UTC)
        self._audit(
            "org_unit.restored", "org_unit", u.id, {"archived_at": before}, {"archived_at": None}
        )
        await self.db.commit()
        return unit_out(u)

    # Positions -------------------------------------------------------------------------------

    async def positions(self, unit_id: uuid.UUID) -> list[PositionOut]:
        await self.get_unit(unit_id)
        rows = await self.db.scalars(
            select(models.Position)
            .where(models.Position.unit_id == unit_id)
            .order_by(models.Position.title)
        )
        return [PositionOut(id=p.id, unit_id=p.unit_id, title=p.title) for p in rows]

    async def create_position(self, unit_id: uuid.UUID, body: PositionIn) -> PositionOut:
        u = await self.get_unit(unit_id)
        if u.archived_at is not None:
            raise ProblemException(
                409, "archived", "Archived", "Restore the unit first (docs/0078)."
            )
        now = datetime.now(UTC)
        p = models.Position(
            id=models.new_id(),
            tenant_id=self._tenant,
            unit_id=unit_id,
            title=body.title,
            created_at=now,
            updated_at=now,
        )
        self.db.add(p)
        self._audit(
            "position.created", "position", p.id, after={"unit_id": unit_id, "title": body.title}
        )
        await self.db.commit()
        return PositionOut(id=p.id, unit_id=p.unit_id, title=p.title)

    async def _position(self, position_id: uuid.UUID) -> models.Position:
        p = await self.db.scalar(
            select(models.Position).where(
                models.Position.tenant_id == self._tenant, models.Position.id == position_id
            )
        )
        if p is None:
            raise ProblemException(
                404, "not-found", "Not found", f"Position {position_id} does not exist."
            )
        return p

    async def rename_position(self, position_id: uuid.UUID, body: PositionIn) -> PositionOut:
        p = await self._position(position_id)
        if p.title != body.title:
            self._audit(
                "position.updated", "position", p.id, {"title": p.title}, {"title": body.title}
            )
            p.title, p.updated_at = body.title, datetime.now(UTC)
            await self.db.commit()
        return PositionOut(id=p.id, unit_id=p.unit_id, title=p.title)

    async def delete_position(self, position_id: uuid.UUID) -> None:
        p = await self._position(position_id)
        used = await self.db.scalar(
            select(models.UnitMembership.person_id)
            .where(models.UnitMembership.position_id == p.id)
            .limit(1)
        )
        if used is not None:
            raise ProblemException(
                409, "in-use", "Position in use", "People currently hold this position."
            )
        await self.db.delete(p)
        self._audit("position.deleted", "position", p.id, before={"title": p.title})
        await self.db.commit()
