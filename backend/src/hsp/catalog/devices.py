"""Devices: the asset identity of placed equipment, stable across floors (docs/0022, 0034-B, 0083).

A device answers "where is monitor MON-0412?": each device reports its current placement in the
published floor plans.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from hsp import models
from hsp.audit import audit_event, changed_fields
from hsp.auth.principal import Principal
from hsp.problems import ProblemError, ProblemException

FIELDS = ("asset_tag", "serial_number", "notes", "assigned_person_id")


class DeviceIn(BaseModel):
    asset_tag: str | None = Field(default=None, min_length=1, max_length=100)
    serial_number: str | None = Field(default=None, max_length=100)
    notes: str | None = None
    assigned_person_id: uuid.UUID | None = None


class DevicePatch(DeviceIn):
    pass


class Placement(BaseModel):
    floor_id: uuid.UUID
    floor_name: str
    element_id: uuid.UUID
    version: int = Field(description="The published version the placement is in")


class DeviceOut(BaseModel):
    id: uuid.UUID
    asset_tag: str | None
    serial_number: str | None
    notes: str | None
    assigned_person_id: uuid.UUID | None
    placement: Placement | None = Field(description="Where it is in the published floor plans")


def _snapshot(d: models.Device) -> dict[str, Any]:
    return {f: getattr(d, f) for f in FIELDS}


@dataclass
class DevicesService:
    db: AsyncSession
    principal: Principal
    request_id: str | None = None

    @property
    def _tenant(self) -> uuid.UUID:
        return self.principal.tenant_id

    async def _placements(self, device_ids: list[uuid.UUID]) -> dict[uuid.UUID, Placement]:
        if not device_ids:
            return {}
        f, r, e = models.Floor, models.ObjectRev, models.FloorElement
        rows = await self.db.execute(
            select(r.device_id, f.id, f.name, r.element_id, f.published_version)
            .join(e, e.id == r.element_id)
            .join(f, f.id == e.floor_id)
            .where(
                f.tenant_id == self._tenant,
                f.published_version.is_not(None),
                r.device_id.in_(device_ids),
                and_(
                    r.from_version <= f.published_version,
                    or_(r.to_version.is_(None), r.to_version > f.published_version),
                ),
            )
        )
        return {
            d: Placement(floor_id=fid, floor_name=name, element_id=el, version=v)
            for d, fid, name, el, v in rows
            if d is not None and v is not None
        }

    async def _out(self, devices: list[models.Device]) -> list[DeviceOut]:
        placed = await self._placements([d.id for d in devices])
        return [DeviceOut(id=d.id, placement=placed.get(d.id), **_snapshot(d)) for d in devices]

    async def _device(self, device_id: uuid.UUID) -> models.Device:
        d = await self.db.scalar(
            select(models.Device).where(
                models.Device.tenant_id == self._tenant, models.Device.id == device_id
            )
        )
        if d is None:
            raise ProblemException(
                404, "not-found", "Not found", f"Device {device_id} does not exist."
            )
        return d

    async def _validate(self, values: dict[str, Any], own: uuid.UUID | None) -> None:
        tag = values.get("asset_tag")
        if tag:
            clash = await self.db.scalar(
                select(models.Device.id).where(
                    models.Device.tenant_id == self._tenant, models.Device.asset_tag == tag
                )
            )
            if clash is not None and clash != own:
                raise ProblemException(
                    409,
                    "asset-tag-taken",
                    "Asset tag already used",
                    f"Another device has asset tag {tag!r} (docs/0022).",
                )
        person = values.get("assigned_person_id")
        if person is not None:
            exists = await self.db.scalar(
                select(models.Person.id).where(
                    models.Person.tenant_id == self._tenant, models.Person.id == person
                )
            )
            if exists is None:
                raise ProblemException(
                    422,
                    "request-invalid",
                    "Request validation failed",
                    errors=[
                        ProblemError(
                            code="person_not_found",
                            message=f"Person {person} does not exist.",
                            pointer="/assigned_person_id",
                        )
                    ],
                )

    def _audit(
        self, action: str, device_id: uuid.UUID, before: Any = None, after: Any = None
    ) -> None:
        self.db.add(
            audit_event(
                self.principal,
                action=action,
                entity_type="device",
                entity_id=device_id,
                before=before,
                after=after,
                request_id=self.request_id,
            )
        )

    async def list(
        self,
        *,
        q: str | None,
        assigned_person_id: uuid.UUID | None,
        after: uuid.UUID | None,
        limit: int,
    ) -> list[DeviceOut]:
        query = select(models.Device).where(models.Device.tenant_id == self._tenant)
        if q:
            pattern = f"%{q.replace('%', r'\%').replace('_', r'\_')}%"
            query = query.where(
                or_(
                    models.Device.asset_tag.ilike(pattern),
                    models.Device.serial_number.ilike(pattern),
                )
            )
        if assigned_person_id is not None:
            query = query.where(models.Device.assigned_person_id == assigned_person_id)
        if after is not None:
            query = query.where(models.Device.id > after)
        return await self._out(
            list(await self.db.scalars(query.order_by(models.Device.id).limit(limit)))
        )

    async def get(self, device_id: uuid.UUID) -> DeviceOut:
        return (await self._out([await self._device(device_id)]))[0]

    async def create(self, body: DeviceIn) -> DeviceOut:
        values = body.model_dump()
        await self._validate(values, None)
        now = datetime.now(UTC)
        d = models.Device(
            id=models.new_id(), tenant_id=self._tenant, created_at=now, updated_at=now, **values
        )
        self.db.add(d)
        self._audit("device.created", d.id, after=values)
        await self.db.commit()
        return (await self._out([d]))[0]

    async def update(self, device_id: uuid.UUID, changes: dict[str, Any]) -> DeviceOut:
        d = await self._device(device_id)
        await self._validate(changes, d.id)
        before = _snapshot(d)
        for k, v in changes.items():
            setattr(d, k, v)
        b, a = changed_fields(before, _snapshot(d))
        if a:
            d.updated_at = datetime.now(UTC)
            self._audit("device.updated", d.id, b, a)
            await self.db.commit()
        return (await self._out([d]))[0]

    async def delete(self, device_id: uuid.UUID) -> None:
        d = await self._device(device_id)
        used = await self.db.scalar(
            select(models.ObjectRev.id).where(models.ObjectRev.device_id == d.id).limit(1)
        )
        if used is not None:
            raise ProblemException(
                409,
                "in-use",
                "Device in use",
                "This device is placed in a floor plan (current or past version).",
            )
        await self.db.delete(d)
        self._audit("device.deleted", d.id, before=_snapshot(d))
        await self.db.commit()
