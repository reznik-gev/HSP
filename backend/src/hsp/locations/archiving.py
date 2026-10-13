"""Archiving cascades down the location tree and frees the seats it takes out of use
(docs/0078, docs/0085, docs/0086).

A site archives its active buildings, a building its active floors, and every archived floor
frees its assigned seats. Everything happens in one transaction, is audited, and is reported back.
The only refusal left is a floor someone is editing: that protects unsaved work.
"""

from dataclasses import dataclass
from datetime import UTC, datetime

from hsp.auth.principal import Principal
from hsp.locations import common
from hsp.locations.repository import Entity, LocationsRepository
from hsp.models import Building, Floor, Site
from hsp.problems import ProblemError, ProblemException
from hsp.release import ArchivedItem, ReleaseReport, freed, seat_unassigned


def _kind(entity: Entity) -> str:
    if isinstance(entity, Site):
        return "site"
    return "building" if isinstance(entity, Building) else "floor"


def _name(entity: Entity) -> str:
    if isinstance(entity, Building):
        return f"Building {entity.code} ({entity.name})"
    return entity.name


@dataclass
class LocationArchiver:
    repo: LocationsRepository
    principal: Principal
    request_id: str | None = None

    async def archive(self, root: Entity) -> ReleaseReport:
        if root.archived_at is not None:
            return ReleaseReport()  # idempotent (docs/0078)
        targets = await self._with_descendants(root)
        floors = [e for e in targets if isinstance(e, Floor)]
        await self._refuse_if_being_edited(floors)

        now = datetime.now(UTC)
        report = ReleaseReport()
        for entity in targets:
            entity.archived_at = entity.updated_at = now
            cascaded = entity is not root
            common.record(
                self.repo,
                self.principal,
                self.request_id,
                action=f"{_kind(entity)}.archived",
                entity_type=_kind(entity),
                entity_id=entity.id,
                after={"archived_at": now},
                reason=f"Archived with {_kind(root)} {root.id}" if cascaded else None,
            )
            report.archived.append(
                ArchivedItem(kind=_kind(entity), id=entity.id, name=_name(entity))
            )

        tenant = self.principal.tenant_id
        for floor in floors:
            for a in await self.repo.free_seats(tenant, floor.id):
                self.repo.record(
                    seat_unassigned(
                        self.principal,
                        a,
                        reason=f"Floor {floor.name} archived",
                        request_id=self.request_id,
                    )
                )
                report.freed_seats.append(freed(a))
        await self.repo.commit()
        return report

    async def _with_descendants(self, root: Entity) -> list[Entity]:
        tenant = self.principal.tenant_id
        out: list[Entity] = [root]
        if isinstance(root, Site):
            buildings = await self.repo.active_buildings(tenant, root.id)
            out += buildings
            for b in buildings:
                out += await self.repo.active_floors(tenant, b.id)
        elif isinstance(root, Building):
            out += await self.repo.active_floors(tenant, root.id)
        return out

    async def _refuse_if_being_edited(self, floors: list[Floor]) -> None:
        now = datetime.now(UTC)
        editing = [
            (f, holder)
            for f in floors
            if (holder := await self.repo.lock_holder(self.principal.tenant_id, f.id, now))
        ]
        if editing:
            first, holder = editing[0]
            raise ProblemException(
                409,
                "floor-locked",
                "Floor is being edited",
                f"{holder} is editing {first.name}. Ask them to finish, or force-release the lock.",
                errors=[
                    ProblemError(
                        code="floor_locked",
                        message=f"{h} is editing {f.name}.",
                        element_id=str(f.id),
                    )
                    for f, h in editing
                ],
            )
