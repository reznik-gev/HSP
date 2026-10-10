"""Publish, discard and restore a floor's draft (docs/0015, 0028, 0031, 0034, 0082)."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol

from pydantic import BaseModel
from sqlalchemy import and_, delete, exists, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from hsp import models
from hsp.audit import audit_event
from hsp.auth.principal import Principal
from hsp.plans.changeset import ATTR, KINDS, Element, Kind
from hsp.plans.drafts import REV_MODEL, DraftRepository, DraftsService
from hsp.plans.schema import PlanContent
from hsp.problems import ProblemError, ProblemException


class PublishIn(BaseModel):
    base_revision: int
    note: str | None = None


class PublishResult(BaseModel):
    floor_id: uuid.UUID
    published_version: int
    superseded_version: int | None


class PublishRepository(Protocol):
    async def discard(
        self, tenant_id: uuid.UUID, floor_id: uuid.UUID, version: int, draft_id: uuid.UUID
    ) -> None: ...

    async def publish(
        self,
        floor_id: uuid.UUID,
        draft_id: uuid.UUID,
        version: int,
        previous: int | None,
        by: str,
        note: str | None,
    ) -> None: ...

    async def seat_labels_elsewhere(
        self, tenant_id: uuid.UUID, floor_id: uuid.UUID
    ) -> dict[str, str]:
        """Seat label -> floor name, in published versions of the building's other active floors."""
        ...

    async def devices_elsewhere(
        self, tenant_id: uuid.UUID, floor_id: uuid.UUID
    ) -> dict[uuid.UUID, str]:
        """Device id -> floor name, over published versions of the tenant's other floors."""
        ...

    async def assigned_seats(
        self, tenant_id: uuid.UUID, element_ids: set[uuid.UUID]
    ) -> set[uuid.UUID]: ...


def _visible_at_published(rev: Any) -> Any:
    f = models.Floor
    return and_(
        rev.from_version <= f.published_version,
        or_(rev.to_version.is_(None), rev.to_version > f.published_version),
    )


class SqlPublishRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def discard(
        self, tenant_id: uuid.UUID, floor_id: uuid.UUID, version: int, draft_id: uuid.UUID
    ) -> None:
        in_floor = select(models.FloorElement.id).where(
            models.FloorElement.tenant_id == tenant_id, models.FloorElement.floor_id == floor_id
        )
        for rev in REV_MODEL.values():
            # Delete first: the draft's revisions occupy [version, open) for their elements...
            await self._db.execute(
                delete(rev).where(rev.element_id.in_(in_floor), rev.from_version == version)
            )
        for rev in REV_MODEL.values():
            # ...so the revisions it closed at `version` can be reopened without overlapping.
            await self._db.execute(
                update(rev)
                .where(rev.element_id.in_(in_floor), rev.to_version == version)
                .values(to_version=None)
            )
        has_revision = or_(
            *(
                exists().where(rev.element_id == models.FloorElement.id)
                for rev in REV_MODEL.values()
            )
        )
        await self._db.execute(
            delete(models.FloorElement).where(
                models.FloorElement.tenant_id == tenant_id,
                models.FloorElement.floor_id == floor_id,
                ~has_revision,
            )
        )
        await self._db.execute(
            delete(models.FloorVersion).where(models.FloorVersion.id == draft_id)
        )

    async def publish(
        self,
        floor_id: uuid.UUID,
        draft_id: uuid.UUID,
        version: int,
        previous: int | None,
        by: str,
        note: str | None,
    ) -> None:
        if previous is not None:
            await self._db.execute(
                update(models.FloorVersion)
                .where(
                    models.FloorVersion.floor_id == floor_id,
                    models.FloorVersion.version_no == previous,
                )
                .values(state=models.FloorVersionState.SUPERSEDED)
            )
        await self._db.execute(
            update(models.FloorVersion)
            .where(models.FloorVersion.id == draft_id)
            .values(
                state=models.FloorVersionState.PUBLISHED,
                published_by=by,
                published_at=datetime.now(UTC),
                note=note,
            )
        )
        await self._db.execute(
            update(models.Floor)
            .where(models.Floor.id == floor_id)
            .values(published_version=version)
        )

    async def seat_labels_elsewhere(
        self, tenant_id: uuid.UUID, floor_id: uuid.UUID
    ) -> dict[str, str]:
        f, r, e = models.Floor, models.ObjectRev, models.FloorElement
        building = select(f.building_id).where(f.id == floor_id).scalar_subquery()
        rows = await self._db.execute(
            select(r.label, f.name)
            .join(e, e.id == r.element_id)
            .join(f, f.id == e.floor_id)
            .join(models.CatalogItemRev, models.CatalogItemRev.id == r.catalog_item_rev_id)
            .where(
                f.tenant_id == tenant_id,
                f.building_id == building,
                f.id != floor_id,
                f.archived_at.is_(None),
                f.published_version.is_not(None),
                _visible_at_published(r),
                models.CatalogItemRev.is_seat.is_(True),
                r.label.is_not(None),
            )
        )
        return {label: name for label, name in rows if label is not None}

    async def devices_elsewhere(
        self, tenant_id: uuid.UUID, floor_id: uuid.UUID
    ) -> dict[uuid.UUID, str]:
        f, r, e = models.Floor, models.ObjectRev, models.FloorElement
        rows = await self._db.execute(
            select(r.device_id, f.name)
            .join(e, e.id == r.element_id)
            .join(f, f.id == e.floor_id)
            .where(
                f.tenant_id == tenant_id,
                f.id != floor_id,
                f.published_version.is_not(None),
                _visible_at_published(r),
                r.device_id.is_not(None),
            )
        )
        return {device_id: name for device_id, name in rows if device_id is not None}

    async def assigned_seats(
        self, tenant_id: uuid.UUID, element_ids: set[uuid.UUID]
    ) -> set[uuid.UUID]:
        if not element_ids:
            return set()
        return set(
            await self._db.scalars(
                select(models.SeatAssignment.seat_element_id).where(
                    models.SeatAssignment.tenant_id == tenant_id,
                    models.SeatAssignment.seat_element_id.in_(element_ids),
                )
            )
        )


def _elements(content: PlanContent) -> dict[tuple[Kind, uuid.UUID], Element]:
    return {(k, e.id): e for k in KINDS for e in getattr(content, ATTR[k])}


def publish_conflicts(
    draft: PlanContent,
    published: PlanContent,
    labels_elsewhere: dict[str, str],
    devices_elsewhere: dict[uuid.UUID, str],
    assigned: set[uuid.UUID],
) -> list[ProblemError]:
    """The docs/0082 publish checks. Pure, so each rule is unit-tested directly."""
    problems: list[ProblemError] = []
    seats = [
        o
        for o in draft.objects
        if (item := draft.catalog.get(str(o.catalog_item_rev_id))) and item.is_seat
    ]
    seen: dict[str, uuid.UUID] = {}
    for seat in seats:
        if not seat.label:
            continue
        if seat.label in seen:
            problems.append(
                ProblemError(
                    code="seat_label_duplicate",
                    message=f"Seat label {seat.label!r} is used twice on this floor.",
                    element_id=str(seat.id),
                    related_ids=[str(seen[seat.label])],
                )
            )
        elif seat.label in labels_elsewhere:
            problems.append(
                ProblemError(
                    code="seat_label_duplicate",
                    message=f"Seat label {seat.label!r} is already used on floor "
                    f"{labels_elsewhere[seat.label]}.",
                    element_id=str(seat.id),
                )
            )
        seen.setdefault(seat.label, seat.id)
    for o in draft.objects:
        if o.device_id and o.device_id in devices_elsewhere:
            problems.append(
                ProblemError(
                    code="device_on_other_floor",
                    message=f"This device is already placed on floor "
                    f"{devices_elsewhere[o.device_id]}.",
                    element_id=str(o.id),
                )
            )
    draft_objects = {o.id: o for o in draft.objects}
    for seat_id in sorted(assigned):
        current = draft_objects.get(seat_id)
        if current is None:
            problems.append(
                ProblemError(
                    code="assigned_seat_removed",
                    element_id=str(seat_id),
                    message="This seat is assigned to someone; unassign it before removing it.",
                )
            )
        elif current.allocation_mode != "assigned":
            problems.append(
                ProblemError(
                    code="assigned_seat_not_assignable",
                    element_id=str(seat_id),
                    message="This seat is assigned to someone; unassign it before changing its "
                    "mode.",
                )
            )
    return problems


@dataclass
class PublishingService:
    drafts: DraftRepository
    repo: PublishRepository
    principal: Principal
    request_id: str | None = None

    @property
    def _tenant(self) -> uuid.UUID:
        return self.principal.tenant_id

    def _guard(self) -> DraftsService:
        return DraftsService(self.drafts, self.principal, self.request_id)

    def _audit(self, action: str, floor_id: uuid.UUID, after: dict[str, Any]) -> None:
        self.drafts.record(
            audit_event(
                self.principal,
                action=action,
                entity_type="floor",
                entity_id=floor_id,
                after=after,
                request_id=self.request_id,
            )
        )

    async def _published_content(self, floor_id: uuid.UUID, published: int | None) -> PlanContent:
        return (
            await self.drafts.load_content(self._tenant, floor_id, published)
            if published
            else PlanContent()
        )

    async def publish(self, floor_id: uuid.UUID, body: PublishIn) -> PublishResult:
        published = await self._guard().require_editable(floor_id)
        draft = await self.drafts.draft_for_update(self._tenant, floor_id)
        if draft is None:
            raise ProblemException(404, "no-draft", "No draft", "There is nothing to publish.")
        if draft.revision != body.base_revision:
            raise ProblemException(
                409,
                "stale-revision",
                "Stale revision",
                f"The draft is at revision {draft.revision}; review the latest changes first.",
            )
        content = await self.drafts.load_content(self._tenant, floor_id, draft.version)
        before = await self._published_content(floor_id, published)
        seat_ids = {o.id for o in content.objects} | {o.id for o in before.objects}
        problems = publish_conflicts(
            content,
            before,
            await self.repo.seat_labels_elsewhere(self._tenant, floor_id),
            await self.repo.devices_elsewhere(self._tenant, floor_id),
            await self.repo.assigned_seats(self._tenant, seat_ids),
        )
        if problems:
            raise ProblemException(
                409,
                "publish-conflicts",
                "Draft can't be published",
                f"{len(problems)} problem(s) to resolve first.",
                errors=problems,
            )
        await self.repo.publish(
            floor_id, draft.id, draft.version, published, self.principal.subject, body.note
        )
        self._audit(
            "floor.published",
            floor_id,
            {"version": draft.version, "superseded": published, "note": body.note},
        )
        await self.drafts.commit()
        return PublishResult(
            floor_id=floor_id, published_version=draft.version, superseded_version=published
        )

    async def discard(self, floor_id: uuid.UUID) -> None:
        await self._guard().require_editable(floor_id)
        draft = await self.drafts.draft_for_update(self._tenant, floor_id)
        if draft is None:
            return  # idempotent
        await self.repo.discard(self._tenant, floor_id, draft.version, draft.id)
        self._audit(
            "floor.draft_discarded",
            floor_id,
            {"version": draft.version, "revision": draft.revision},
        )
        await self.drafts.commit()

    async def restore(self, floor_id: uuid.UUID, version: int) -> None:
        published = await self._guard().require_editable(floor_id)
        if await self.drafts.draft_for_update(self._tenant, floor_id) is not None:
            raise ProblemException(
                409,
                "draft-exists",
                "Draft exists",
                "Discard or publish the current draft before restoring an older version.",
            )
        if published is None or not 1 <= version <= published:
            raise ProblemException(
                404,
                "not-found",
                "Not found",
                f"Floor {floor_id} has no published version {version}.",
            )
        target = _elements(await self.drafts.load_content(self._tenant, floor_id, version))
        current = _elements(await self._published_content(floor_id, published))
        upserted = {key: e for key, e in target.items() if key not in current or current[key] != e}
        deleted = set(current) - set(target)
        draft = await self.drafts.create_draft(
            self._tenant, floor_id, published + 1, self.principal.subject
        )
        await self.drafts.save(self._tenant, floor_id, draft.version, upserted, deleted)
        self._audit(
            "floor.draft_restored", floor_id, {"version": draft.version, "restored_from": version}
        )
        await self.drafts.commit()
