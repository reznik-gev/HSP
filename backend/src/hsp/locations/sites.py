"""Site use cases: create, read, update, archive, restore (docs/0020, docs/0033, docs/0078)."""

import uuid
import zoneinfo
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from hsp.audit import changed_fields
from hsp.auth.principal import Principal
from hsp.locations import common
from hsp.locations.repository import LocationsRepository
from hsp.models import Site, new_id

EDITABLE = ("name", "address", "time_zone")


def validate_time_zone(tz: str) -> str:
    try:
        zoneinfo.ZoneInfo(tz)
    except (zoneinfo.ZoneInfoNotFoundError, ValueError):
        raise common.invalid_field(
            "time_zone_unknown", f"Unknown IANA time zone: {tz}", "/time_zone"
        ) from None
    return tz


def snapshot(site: Site) -> dict[str, Any]:
    return {k: getattr(site, k) for k in (*EDITABLE, "archived_at")}


@dataclass
class SitesService:
    repo: LocationsRepository
    principal: Principal
    request_id: str | None = None

    async def list(
        self, *, include_archived: bool, after: uuid.UUID | None, limit: int
    ) -> list[Site]:
        return await self.repo.list_sites(
            self.principal.tenant_id, include_archived=include_archived, after=after, limit=limit
        )

    async def get(self, site_id: uuid.UUID) -> Site:
        site = await self.repo.get_site(self.principal.tenant_id, site_id)
        if site is None:
            raise common.not_found("site", site_id)
        return site

    async def create(self, *, name: str, address: str | None, time_zone: str) -> Site:
        now = datetime.now(UTC)
        site = Site(
            id=new_id(),
            tenant_id=self.principal.tenant_id,
            name=name,
            address=address,
            time_zone=validate_time_zone(time_zone),
            created_at=now,
            updated_at=now,
            archived_at=None,
        )
        self.repo.add(site)
        self._audit("site.created", site, after=snapshot(site))
        await self.repo.commit()
        return site

    async def update(self, site_id: uuid.UUID, changes: dict[str, Any]) -> Site:
        site = await self.get(site_id)
        if site.archived_at is not None:
            raise common.archived_read_only("site")
        if "time_zone" in changes:
            validate_time_zone(changes["time_zone"])
        before = snapshot(site)
        for key, value in changes.items():
            if key in EDITABLE:
                setattr(site, key, value)
        b, a = changed_fields(before, snapshot(site))
        if a:
            site.updated_at = datetime.now(UTC)
            self._audit("site.updated", site, before=b, after=a)
            await self.repo.commit()
        return site

    async def archive(self, site_id: uuid.UUID) -> None:
        site = await self.get(site_id)
        if site.archived_at is not None:
            return  # idempotent (docs/0078)
        blocking = await self.repo.active_buildings(self.principal.tenant_id, site_id)
        if blocking:
            raise common.has_active_children(
                "site", "building", [(b.id, f"Building {b.code} ({b.name})") for b in blocking]
            )
        site.archived_at = site.updated_at = datetime.now(UTC)
        self._audit("site.archived", site, after={"archived_at": site.archived_at})
        await self.repo.commit()

    async def restore(self, site_id: uuid.UUID) -> Site:
        site = await self.get(site_id)
        if site.archived_at is None:
            return site
        before = site.archived_at
        site.archived_at = None
        site.updated_at = datetime.now(UTC)
        self._audit(
            "site.restored", site, before={"archived_at": before}, after={"archived_at": None}
        )
        await self.repo.commit()
        return site

    def _audit(
        self,
        action: str,
        site: Site,
        *,
        before: dict[str, Any] | None = None,
        after: dict[str, Any] | None = None,
    ) -> None:
        common.record(
            self.repo,
            self.principal,
            self.request_id,
            action=action,
            entity_type="site",
            entity_id=site.id,
            before=before,
            after=after,
        )
