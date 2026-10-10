"""Drafts and changesets: persistence and use cases (docs/0015, 0016, 0028, 0036, 0081).

Version-range writes (docs/0028), for draft version D:
- add:     insert the element + a revision [D, open)
- update:  a revision that started in D is updated in place; an older one is closed at D and a
           new revision [D, open) is inserted, so published versions stay untouched
- delete:  a revision that started in D is deleted (and the element too if it has no history);
           an older one is closed at D
"""

import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol

from geoalchemy2.elements import WKTElement
from pydantic import BaseModel
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from hsp import models
from hsp.audit import audit_event
from hsp.auth.principal import Principal
from hsp.plans.changeset import (
    ChangesetIn,
    ChangesetRejected,
    Element,
    Kind,
    References,
    apply_changeset,
    needed_references,
)
from hsp.plans.repository import SqlPlanRepository
from hsp.plans.schema import (
    CatalogItem,
    Column,
    Opening,
    PlacedObject,
    PlanContent,
    Point2,
    Wall,
    Zone,
)
from hsp.problems import ProblemError, ProblemException


class ChangesetResult(BaseModel):
    floor_id: uuid.UUID
    version: int
    revision: int
    cascaded: list[dict[str, Any]]
    warnings: list[dict[str, Any]] = []


@dataclass(frozen=True)
class DraftRow:
    id: uuid.UUID
    version: int
    revision: int


REV_MODEL: dict[Kind, Any] = {
    "wall": models.WallRev,
    "opening": models.OpeningRev,
    "column": models.ColumnRev,
    "zone": models.ZoneRev,
    "object": models.ObjectRev,
}
ELEMENT_KIND: dict[Kind, models.ElementKind] = {
    "wall": models.ElementKind.WALL,
    "opening": models.ElementKind.OPENING,
    "column": models.ElementKind.COLUMN,
    "zone": models.ElementKind.ZONE,
    "object": models.ElementKind.OBJECT,
}


def _ring(points: list[Point2]) -> str:
    closed = [*points, points[0]]
    return "POLYGON((" + ", ".join(f"{x} {y}" for x, y in closed) + "))"


def revision_columns(element: Element) -> dict[str, Any]:
    """Map an API element to its *_rev table columns (docs/0029: integer mm, SRID 0)."""
    match element:
        case Wall():
            (ax, ay), (bx, by) = element.a, element.b
            return {
                "centerline": WKTElement(f"LINESTRING({ax} {ay}, {bx} {by})"),
                "thickness_mm": element.thickness_mm,
                "height_mm": element.height_mm,
            }
        case Opening():
            return {
                "wall_element_id": element.wall_id,
                "opening_type": models.OpeningType(element.type),
                "offset_mm": element.offset_mm,
                "width_mm": element.width_mm,
                "height_mm": element.height_mm,
                "sill_mm": element.sill_mm,
                "swing": models.DoorSwing(element.swing),
            }
        case Column():
            return {
                "footprint": WKTElement(_ring(element.footprint)),
                "height_mm": element.height_mm,
            }
        case Zone():
            return {
                "name": element.name,
                "zone_type_id": element.zone_type_id,
                "parent_zone_element_id": element.parent_zone_id,
                "boundary": WKTElement(_ring(element.boundary)),
            }
        case PlacedObject():
            x, y, z = element.position
            mode = element.allocation_mode
            return {
                "catalog_item_rev_id": element.catalog_item_rev_id,
                "position": WKTElement(f"POINT Z ({x} {y} {z})"),
                "rotation_ddeg": element.rotation_ddeg,
                "label": element.label,
                "attached_to_element_id": element.attached_to,
                "device_id": element.device_id,
                "allocation_mode": models.AllocationMode(mode) if mode else None,
            }
    raise TypeError(f"unknown element {type(element).__name__}")


class DraftRepository(Protocol):
    async def floor_info(
        self, tenant_id: uuid.UUID, floor_id: uuid.UUID
    ) -> tuple[bool, int | None] | None:
        """(archived, published_version), or None if the floor doesn't exist."""
        ...

    async def lock_holder(
        self, tenant_id: uuid.UUID, floor_id: uuid.UUID, now: datetime
    ) -> str | None: ...

    async def draft_for_update(self, tenant_id: uuid.UUID, floor_id: uuid.UUID) -> DraftRow | None:
        """The draft row, locked against concurrent changesets until commit."""
        ...

    async def create_draft(
        self, tenant_id: uuid.UUID, floor_id: uuid.UUID, version: int, created_by: str
    ) -> DraftRow: ...

    async def load_content(
        self, tenant_id: uuid.UUID, floor_id: uuid.UUID, version: int
    ) -> PlanContent: ...

    async def load_references(
        self,
        tenant_id: uuid.UUID,
        catalog_ids: set[uuid.UUID],
        zone_type_ids: set[uuid.UUID],
        device_ids: set[uuid.UUID],
    ) -> References: ...

    async def existing_element_ids(self, ids: Iterable[uuid.UUID]) -> set[uuid.UUID]:
        """Ids already used by any element, including ones only present in old versions."""
        ...

    async def save(
        self,
        tenant_id: uuid.UUID,
        floor_id: uuid.UUID,
        version: int,
        upserted: dict[tuple[Kind, uuid.UUID], Element],
        deleted: set[tuple[Kind, uuid.UUID]],
    ) -> None: ...

    async def set_revision(self, draft_id: uuid.UUID, revision: int) -> None: ...

    def record(self, event: models.AuditEvent) -> None: ...

    async def commit(self) -> None: ...


class SqlDraftRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._plans = SqlPlanRepository(db)

    async def floor_info(
        self, tenant_id: uuid.UUID, floor_id: uuid.UUID
    ) -> tuple[bool, int | None] | None:
        row = (
            await self._db.execute(
                select(models.Floor.archived_at, models.Floor.published_version).where(
                    models.Floor.tenant_id == tenant_id, models.Floor.id == floor_id
                )
            )
        ).first()
        return None if row is None else (row[0] is not None, row[1])

    async def lock_holder(
        self, tenant_id: uuid.UUID, floor_id: uuid.UUID, now: datetime
    ) -> str | None:
        return await self._db.scalar(
            select(models.FloorEditLock.holder_subject).where(
                models.FloorEditLock.tenant_id == tenant_id,
                models.FloorEditLock.floor_id == floor_id,
                models.FloorEditLock.expires_at > now,
            )
        )

    async def draft_for_update(self, tenant_id: uuid.UUID, floor_id: uuid.UUID) -> DraftRow | None:
        row = await self._db.scalar(
            select(models.FloorVersion)
            .where(
                models.FloorVersion.tenant_id == tenant_id,
                models.FloorVersion.floor_id == floor_id,
                models.FloorVersion.state == models.FloorVersionState.DRAFT,
            )
            .with_for_update()
        )
        return DraftRow(row.id, row.version_no, row.revision) if row else None

    async def create_draft(
        self, tenant_id: uuid.UUID, floor_id: uuid.UUID, version: int, created_by: str
    ) -> DraftRow:
        row = models.FloorVersion(
            id=models.new_id(),
            tenant_id=tenant_id,
            floor_id=floor_id,
            version_no=version,
            state=models.FloorVersionState.DRAFT,
            revision=0,
            created_by=created_by,
            created_at=datetime.now(UTC),
        )
        self._db.add(row)
        await self._db.flush()
        return DraftRow(row.id, version, 0)

    async def load_content(
        self, tenant_id: uuid.UUID, floor_id: uuid.UUID, version: int
    ) -> PlanContent:
        return await self._plans.load_content(tenant_id, floor_id, version)

    async def load_references(
        self,
        tenant_id: uuid.UUID,
        catalog_ids: set[uuid.UUID],
        zone_type_ids: set[uuid.UUID],
        device_ids: set[uuid.UUID],
    ) -> References:
        catalog: dict[uuid.UUID, CatalogItem] = {}
        if catalog_ids:
            rows = await self._db.execute(
                select(models.CatalogItemRev, models.CatalogItem)
                .join(models.CatalogItem, models.CatalogItem.id == models.CatalogItemRev.item_id)
                .where(
                    models.CatalogItemRev.id.in_(catalog_ids),
                    or_(
                        models.CatalogItem.tenant_id.is_(None),
                        models.CatalogItem.tenant_id == tenant_id,
                    ),
                )
            )
            for rev, item in rows:
                catalog[rev.id] = CatalogItem(
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
        zone_types = set()
        if zone_type_ids:
            zone_types = set(
                await self._db.scalars(
                    select(models.ZoneType.id).where(
                        models.ZoneType.tenant_id == tenant_id,
                        models.ZoneType.id.in_(zone_type_ids),
                    )
                )
            )
        devices = set()
        if device_ids:
            devices = set(
                await self._db.scalars(
                    select(models.Device.id).where(
                        models.Device.tenant_id == tenant_id, models.Device.id.in_(device_ids)
                    )
                )
            )
        return References(
            catalog=catalog, zone_type_ids=frozenset(zone_types), device_ids=frozenset(devices)
        )

    async def existing_element_ids(self, ids: Iterable[uuid.UUID]) -> set[uuid.UUID]:
        wanted = set(ids)
        if not wanted:
            return set()
        return set(
            await self._db.scalars(
                select(models.FloorElement.id).where(models.FloorElement.id.in_(wanted))
            )
        )

    async def _open_revision(self, kind: Kind, element_id: uuid.UUID) -> Any:
        rev = REV_MODEL[kind]
        return await self._db.scalar(
            select(rev).where(rev.element_id == element_id, rev.to_version.is_(None))
        )

    async def save(
        self,
        tenant_id: uuid.UUID,
        floor_id: uuid.UUID,
        version: int,
        upserted: dict[tuple[Kind, uuid.UUID], Element],
        deleted: set[tuple[Kind, uuid.UUID]],
    ) -> None:
        # 1) Removals first: delete draft-only revisions, close older ones at `version`.
        orphan_candidates: list[uuid.UUID] = []
        for kind, element_id in deleted:
            open_rev = await self._open_revision(kind, element_id)
            if open_rev is None:
                continue
            if open_rev.from_version == version:
                await self._db.delete(open_rev)
                orphan_candidates.append(element_id)
            else:
                open_rev.to_version = version
        await self._db.flush()

        # 2) New elements: insert all floor_element rows before any revision references them
        #    (the models declare no ORM relationships, so flush order must be explicit).
        new_ids = {eid for (_, eid) in upserted} - await self.existing_element_ids(
            eid for (_, eid) in upserted
        )
        for (kind, element_id), _ in upserted.items():
            if element_id in new_ids:
                self._db.add(
                    models.FloorElement(
                        id=element_id,
                        tenant_id=tenant_id,
                        floor_id=floor_id,
                        kind=ELEMENT_KIND[kind],
                    )
                )
        await self._db.flush()

        # 3) Revisions: update draft-started ones in place, close + reopen older ones.
        for (kind, element_id), element in upserted.items():
            columns = revision_columns(element)
            open_rev = (
                None if element_id in new_ids else await self._open_revision(kind, element_id)
            )
            if open_rev is not None and open_rev.from_version == version:
                for name, value in columns.items():
                    setattr(open_rev, name, value)
                continue
            if open_rev is not None:
                open_rev.to_version = version
                await self._db.flush()  # free the open range before inserting the new one
            self._db.add(
                REV_MODEL[kind](
                    id=models.new_id(),
                    tenant_id=tenant_id,
                    element_id=element_id,
                    from_version=version,
                    to_version=None,
                    **columns,
                )
            )
        await self._db.flush()

        # 4) Elements created and deleted within this draft leave no trace.
        for element_id in orphan_candidates:
            if not await self._has_revisions(element_id):
                await self._db.execute(
                    delete(models.FloorElement).where(models.FloorElement.id == element_id)
                )

    async def _has_revisions(self, element_id: uuid.UUID) -> bool:
        for rev in REV_MODEL.values():
            if await self._db.scalar(select(rev.id).where(rev.element_id == element_id).limit(1)):
                return True
        return False

    async def set_revision(self, draft_id: uuid.UUID, revision: int) -> None:
        row = await self._db.get(models.FloorVersion, draft_id)
        if row is not None:
            row.revision = revision

    def record(self, event: models.AuditEvent) -> None:
        self._db.add(event)

    async def commit(self) -> None:
        await self._db.commit()


@dataclass
class DraftsService:
    repo: DraftRepository
    principal: Principal
    request_id: str | None = None

    @property
    def _tenant(self) -> uuid.UUID:
        return self.principal.tenant_id

    async def require_editable(self, floor_id: uuid.UUID) -> int | None:
        """Floor exists, is active and the caller holds its edit lock. Returns published version."""
        info = await self.repo.floor_info(self._tenant, floor_id)
        if info is None:
            raise ProblemException(
                404, "not-found", "Not found", f"Floor {floor_id} does not exist."
            )
        archived, published = info
        if archived:
            raise ProblemException(
                409, "archived", "Archived", "Restore the floor before editing it (docs/0078)."
            )
        holder = await self.repo.lock_holder(self._tenant, floor_id, datetime.now(UTC))
        if holder is None:
            raise ProblemException(
                409,
                "lock-required",
                "Edit lock required",
                "Acquire the edit lock (POST /floors/{id}/lock) before editing (docs/0016).",
            )
        if holder != self.principal.subject:
            raise ProblemException(
                423, "floor-locked", "Floor is being edited", "Someone else holds the edit lock."
            )
        return published

    async def _start_draft(self, floor_id: uuid.UUID, published: int | None) -> DraftRow:
        draft = await self.repo.create_draft(
            self._tenant, floor_id, (published or 0) + 1, self.principal.subject
        )
        self.repo.record(
            audit_event(
                self.principal,
                action="floor.draft_created",
                entity_type="floor",
                entity_id=floor_id,
                after={"version": draft.version},
                request_id=self.request_id,
            )
        )
        return draft

    async def create_draft(self, floor_id: uuid.UUID) -> int:
        published = await self.require_editable(floor_id)
        if await self.repo.draft_for_update(self._tenant, floor_id) is not None:
            raise ProblemException(
                409, "draft-exists", "Draft exists", "This floor already has a draft."
            )
        draft = await self._start_draft(floor_id, published)
        await self.repo.commit()
        return draft.version

    async def apply(self, floor_id: uuid.UUID, changeset: ChangesetIn) -> ChangesetResult:
        published = await self.require_editable(floor_id)
        draft = await self.repo.draft_for_update(self._tenant, floor_id)
        if draft is None:
            if changeset.base_revision != 0:
                raise ProblemException(
                    409,
                    "stale-revision",
                    "Stale revision",
                    "There is no draft any more; reload the floor.",
                )
            draft = await self._start_draft(floor_id, published)  # first save starts it (docs/0081)
        elif draft.revision != changeset.base_revision:
            raise ProblemException(
                409,
                "stale-revision",
                "Stale revision",
                f"The draft is at revision {draft.revision}, not {changeset.base_revision}; "
                "reload it.",
            )

        content = await self.repo.load_content(self._tenant, floor_id, draft.version)
        refs = await self.repo.load_references(
            self._tenant, *needed_references(content, changeset.ops)
        )
        try:
            effects = apply_changeset(content, changeset.ops, refs)
        except ChangesetRejected as rejected:
            raise _invalid(rejected.errors) from None

        in_draft = (
            {w.id for w in content.walls}
            | {o.id for o in content.openings}
            | {c.id for c in content.columns}
            | {z.id for z in content.zones}
            | {o.id for o in content.objects}
        )
        added = {element_id for (_, element_id) in effects.upserted} - in_draft
        reused = await self.repo.existing_element_ids(added)
        if reused:  # ids from old versions or other floors are permanent (docs/0028)
            raise _invalid(
                [
                    ProblemError(
                        code="duplicate_id",
                        message=f"Element id {eid} was already used.",
                        element_id=str(eid),
                        op_index=next(
                            (i for i, op in enumerate(changeset.ops) if op.id == eid), None
                        ),
                    )
                    for eid in sorted(reused)
                ]
            )

        await self.repo.save(
            self._tenant, floor_id, draft.version, effects.upserted, effects.deleted
        )
        revision = draft.revision + 1
        await self.repo.set_revision(draft.id, revision)
        await self.repo.commit()
        return ChangesetResult(
            floor_id=floor_id,
            version=draft.version,
            revision=revision,
            cascaded=[c.model_dump(mode="json") for c in effects.cascaded],
        )


def _invalid(errors: list[ProblemError]) -> ProblemException:
    return ProblemException(
        422,
        "changeset-invalid",
        "Changeset violates floor rules",
        f"{len(errors)} problem(s); nothing was saved.",
        errors=errors,
    )
