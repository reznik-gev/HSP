"""Building use cases (docs/0020, docs/0033, docs/0078). Codes are unique per site, archived
buildings included (the database constraint covers them too)."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from hsp.audit import changed_fields
from hsp.auth.principal import Principal
from hsp.locations import common
from hsp.locations.repository import LocationsRepository
from hsp.models import Building, Site, new_id
from hsp.problems import ProblemException

EDITABLE = ("name", "code")


def snapshot(b: Building) -> dict[str, Any]:
    return {"site_id": b.site_id, "name": b.name, "code": b.code, "archived_at": b.archived_at}


@dataclass
class BuildingsService:
    repo: LocationsRepository
    principal: Principal
    request_id: str | None = None

    @property
    def _tenant(self) -> uuid.UUID:
        return self.principal.tenant_id

    async def list(
        self,
        *,
        site_id: uuid.UUID | None,
        include_archived: bool,
        after: uuid.UUID | None,
        limit: int,
    ) -> list[Building]:
        return await self.repo.list_buildings(
            self._tenant,
            site_id=site_id,
            include_archived=include_archived,
            after=after,
            limit=limit,
        )

    async def get(self, building_id: uuid.UUID) -> Building:
        building = await self.repo.get_building(self._tenant, building_id)
        if building is None:
            raise common.not_found("building", building_id)
        return building

    async def _active_site(self, site_id: uuid.UUID) -> Site:
        site = await self.repo.get_site(self._tenant, site_id)
        if site is None:
            raise common.invalid_field(
                "site_not_found", f"Site {site_id} does not exist.", "/site_id"
            )
        if site.archived_at is not None:
            raise common.parent_archived("building", "site")
        return site

    async def _ensure_code_free(
        self, site_id: uuid.UUID, code: str, own_id: uuid.UUID | None
    ) -> None:
        clash = await self.repo.building_with_code(self._tenant, site_id, code)
        if clash is not None and clash.id != own_id:
            state = "an archived building" if clash.archived_at else "another building"
            raise ProblemException(
                409,
                "code-taken",
                "Building code already used",
                f"Code {code!r} is used by {state} in this site ({clash.name}).",
            )

    async def create(self, *, site_id: uuid.UUID, name: str, code: str) -> Building:
        await self._active_site(site_id)
        await self._ensure_code_free(site_id, code, None)
        now = datetime.now(UTC)
        building = Building(
            id=new_id(),
            tenant_id=self._tenant,
            site_id=site_id,
            name=name,
            code=code,
            created_at=now,
            updated_at=now,
            archived_at=None,
        )
        self.repo.add(building)
        self._audit("building.created", building, after=snapshot(building))
        await self.repo.commit()
        return building

    async def update(self, building_id: uuid.UUID, changes: dict[str, Any]) -> Building:
        building = await self.get(building_id)
        if building.archived_at is not None:
            raise common.archived_read_only("building")
        if "code" in changes and changes["code"] != building.code:
            await self._ensure_code_free(building.site_id, changes["code"], building.id)
        before = snapshot(building)
        for key, value in changes.items():
            if key in EDITABLE:
                setattr(building, key, value)
        b, a = changed_fields(before, snapshot(building))
        if a:
            building.updated_at = datetime.now(UTC)
            self._audit("building.updated", building, before=b, after=a)
            await self.repo.commit()
        return building

    async def archive(self, building_id: uuid.UUID) -> None:
        building = await self.get(building_id)
        if building.archived_at is not None:
            return
        blocking = await self.repo.active_floors(self._tenant, building_id)
        if blocking:
            raise common.has_active_children(
                "building",
                "floor",
                [(f.id, f"Floor {f.name} (level {f.level_index})") for f in blocking],
            )
        building.archived_at = building.updated_at = datetime.now(UTC)
        self._audit("building.archived", building, after={"archived_at": building.archived_at})
        await self.repo.commit()

    async def restore(self, building_id: uuid.UUID) -> Building:
        building = await self.get(building_id)
        if building.archived_at is None:
            return building
        await self._active_site(building.site_id)  # restore top-down (docs/0078)
        before = building.archived_at
        building.archived_at = None
        building.updated_at = datetime.now(UTC)
        self._audit(
            "building.restored",
            building,
            before={"archived_at": before},
            after={"archived_at": None},
        )
        await self.repo.commit()
        return building

    def _audit(
        self,
        action: str,
        building: Building,
        *,
        before: dict[str, Any] | None = None,
        after: dict[str, Any] | None = None,
    ) -> None:
        common.record(
            self.repo,
            self.principal,
            self.request_id,
            action=action,
            entity_type="building",
            entity_id=building.id,
            before=before,
            after=after,
        )
