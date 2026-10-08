"""Site use cases: create, read, update, archive, restore (docs/0020, docs/0033, docs/0078)."""

import uuid
import zoneinfo
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from hsp.audit import audit_event, changed_fields
from hsp.auth.principal import Principal
from hsp.locations.repository import LocationsRepository
from hsp.models import Site, new_id
from hsp.problems import ProblemError, ProblemException

EDITABLE = ("name", "address", "time_zone")


def validate_time_zone(tz: str) -> str:
    try:
        zoneinfo.ZoneInfo(tz)
    except (zoneinfo.ZoneInfoNotFoundError, ValueError):
        raise ProblemException(
            422,
            "request-invalid",
            "Request validation failed",
            errors=[
                ProblemError(
                    code="time_zone_unknown",
                    message=f"Unknown IANA time zone: {tz}",
                    pointer="/time_zone",
                )
            ],
        ) from None
    return tz


def snapshot(site: Site) -> dict[str, Any]:
    return {k: getattr(site, k) for k in (*EDITABLE, "archived_at")}


def not_found(site_id: uuid.UUID) -> ProblemException:
    return ProblemException(404, "not-found", "Not found", f"Site {site_id} does not exist.")


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
            raise not_found(site_id)
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
            raise ProblemException(
                409, "archived", "Archived", "Restore the site before editing it (docs/0078)."
            )
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
            raise ProblemException(
                409,
                "has-active-children",
                "Site has active buildings",
                "Archive its buildings first (docs/0078).",
                errors=[
                    ProblemError(
                        code="active_child",
                        message=f"Building {b.code} ({b.name})",
                        element_id=str(b.id),
                    )
                    for b in blocking
                ],
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
        self.repo.record(
            audit_event(
                self.principal,
                action=action,
                entity_type="site",
                entity_id=site.id,
                before=before,
                after=after,
                request_id=self.request_id,
            )
        )
