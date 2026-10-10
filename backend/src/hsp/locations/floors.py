"""Floor use cases (docs/0020, docs/0029, docs/0033, docs/0078).

A floor is the unit that is edited, locked and versioned (docs/0015, 0016). This module only
manages the floor's own record; its plan (walls, zones, objects) comes with the plan API.
`published_version` is read-only here: only publishing changes it (docs/0015).
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from hsp.audit import changed_fields
from hsp.auth.principal import Principal
from hsp.locations import common
from hsp.locations.repository import LocationsRepository
from hsp.models import Building, Floor, new_id
from hsp.problems import ProblemException

EDITABLE = (
    "name",
    "level_index",
    "elevation_mm",
    "default_wall_height_mm",
    "origin_x_mm",
    "origin_y_mm",
)


def snapshot(f: Floor) -> dict[str, Any]:
    return {"building_id": f.building_id, "archived_at": f.archived_at} | {
        k: getattr(f, k) for k in EDITABLE
    }


@dataclass
class FloorsService:
    repo: LocationsRepository
    principal: Principal
    request_id: str | None = None

    @property
    def _tenant(self) -> uuid.UUID:
        return self.principal.tenant_id

    async def list(
        self,
        *,
        building_id: uuid.UUID | None,
        include_archived: bool,
        after: uuid.UUID | None,
        limit: int,
    ) -> list[Floor]:
        return await self.repo.list_floors(
            self._tenant,
            building_id=building_id,
            include_archived=include_archived,
            after=after,
            limit=limit,
        )

    async def get(self, floor_id: uuid.UUID) -> Floor:
        floor = await self.repo.get_floor(self._tenant, floor_id)
        if floor is None:
            raise common.not_found("floor", floor_id)
        return floor

    async def _active_building(self, building_id: uuid.UUID) -> Building:
        building = await self.repo.get_building(self._tenant, building_id)
        if building is None:
            raise common.invalid_field(
                "building_not_found", f"Building {building_id} does not exist.", "/building_id"
            )
        if building.archived_at is not None:
            raise common.parent_archived("floor", "building")
        return building

    async def _ensure_level_free(
        self, building_id: uuid.UUID, level_index: int, own_id: uuid.UUID | None
    ) -> None:
        clash = await self.repo.floor_at_level(self._tenant, building_id, level_index)
        if clash is not None and clash.id != own_id:
            state = "an archived floor" if clash.archived_at else "another floor"
            raise ProblemException(
                409,
                "level-taken",
                "Level already used",
                f"Level {level_index} is used by {state} in this building ({clash.name}).",
            )

    async def create(self, *, building_id: uuid.UUID, **fields: Any) -> Floor:
        await self._active_building(building_id)
        await self._ensure_level_free(building_id, fields["level_index"], None)
        now = datetime.now(UTC)
        floor = Floor(
            id=new_id(),
            tenant_id=self._tenant,
            building_id=building_id,
            published_version=None,
            created_at=now,
            updated_at=now,
            archived_at=None,
            **{k: fields[k] for k in EDITABLE},
        )
        self.repo.add(floor)
        self._audit("floor.created", floor, after=snapshot(floor))
        await self.repo.commit()
        return floor

    async def update(self, floor_id: uuid.UUID, changes: dict[str, Any]) -> Floor:
        floor = await self.get(floor_id)
        if floor.archived_at is not None:
            raise common.archived_read_only("floor")
        level = changes.get("level_index")
        if level is not None and level != floor.level_index:
            await self._ensure_level_free(floor.building_id, level, floor.id)
        before = snapshot(floor)
        for key, value in changes.items():
            if key in EDITABLE and value is not None:
                setattr(floor, key, value)
        b, a = changed_fields(before, snapshot(floor))
        if a:
            floor.updated_at = datetime.now(UTC)
            self._audit("floor.updated", floor, before=b, after=a)
            await self.repo.commit()
        return floor

    async def archive(self, floor_id: uuid.UUID) -> None:
        # TODO(seat assignments): once that API exists, also refuse archiving a floor that has
        # assigned seats (docs/0031).
        floor = await self.get(floor_id)
        if floor.archived_at is not None:
            return
        holder = await self.repo.lock_holder(self._tenant, floor_id, datetime.now(UTC))
        if holder is not None:
            raise ProblemException(
                409,
                "floor-locked",
                "Floor is being edited",
                f"{holder} is editing this floor. Ask them to finish, or force-release the lock.",
            )
        floor.archived_at = floor.updated_at = datetime.now(UTC)
        self._audit("floor.archived", floor, after={"archived_at": floor.archived_at})
        await self.repo.commit()

    async def restore(self, floor_id: uuid.UUID) -> Floor:
        floor = await self.get(floor_id)
        if floor.archived_at is None:
            return floor
        await self._active_building(floor.building_id)  # restore top-down (docs/0078)
        before = floor.archived_at
        floor.archived_at = None
        floor.updated_at = datetime.now(UTC)
        self._audit(
            "floor.restored", floor, before={"archived_at": before}, after={"archived_at": None}
        )
        await self.repo.commit()
        return floor

    def _audit(
        self,
        action: str,
        floor: Floor,
        *,
        before: dict[str, Any] | None = None,
        after: dict[str, Any] | None = None,
    ) -> None:
        common.record(
            self.repo,
            self.principal,
            self.request_id,
            action=action,
            entity_type="floor",
            entity_id=floor.id,
            before=before,
            after=after,
        )
