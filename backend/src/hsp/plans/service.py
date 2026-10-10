"""Reading floor plans with the visibility rules of docs/0080: published and superseded versions
for everyone, drafts (and discarded drafts) for admins only."""

import uuid
from dataclasses import dataclass

from hsp.auth.principal import Principal
from hsp.plans.diff import diff_plans
from hsp.plans.repository import PlanRepository
from hsp.plans.schema import FloorVersion, Plan, PlanDiff
from hsp.problems import ProblemException

PUBLIC_STATES = frozenset({"published", "superseded"})


@dataclass
class PlansService:
    repo: PlanRepository
    principal: Principal

    def _may_see(self, v: FloorVersion) -> bool:
        return self.principal.is_admin or v.state in PUBLIC_STATES

    async def _require_floor(self, floor_id: uuid.UUID) -> None:
        if not await self.repo.floor_exists(self.principal.tenant_id, floor_id):
            raise ProblemException(
                404, "not-found", "Not found", f"Floor {floor_id} does not exist."
            )

    async def versions(self, floor_id: uuid.UUID) -> list[FloorVersion]:
        await self._require_floor(floor_id)
        all_versions = await self.repo.list_versions(self.principal.tenant_id, floor_id)
        return [v for v in all_versions if self._may_see(v)]

    async def _version(self, floor_id: uuid.UUID, number: int) -> FloorVersion:
        found = next((v for v in await self.versions(floor_id) if v.version == number), None)
        if found is None:
            # Hidden and missing look the same, so drafts aren't revealed (docs/0080).
            raise ProblemException(
                404,
                "not-found",
                "Not found",
                f"Version {number} of floor {floor_id} does not exist.",
            )
        return found

    async def _plan(self, floor_id: uuid.UUID, v: FloorVersion) -> Plan:
        content = await self.repo.load_content(self.principal.tenant_id, floor_id, v.version)
        return Plan(
            floor_id=floor_id,
            version=v.version,
            state=v.state,
            revision=v.revision,
            **content.model_dump(),
        )

    async def plan(self, floor_id: uuid.UUID, number: int) -> Plan:
        return await self._plan(floor_id, await self._version(floor_id, number))

    async def draft(self, floor_id: uuid.UUID) -> Plan:
        if not self.principal.is_admin:
            raise ProblemException(
                403, "forbidden", "Forbidden", "Drafts are visible to hsp-admin only."
            )
        draft = next((v for v in await self.versions(floor_id) if v.state == "draft"), None)
        if draft is None:
            raise ProblemException(404, "no-draft", "No draft", f"Floor {floor_id} has no draft.")
        return await self._plan(floor_id, draft)

    async def diff(self, floor_id: uuid.UUID, a: int, b: int) -> PlanDiff:
        va, vb = await self._version(floor_id, a), await self._version(floor_id, b)
        tenant = self.principal.tenant_id
        content_a = await self.repo.load_content(tenant, floor_id, va.version)
        content_b = await self.repo.load_content(tenant, floor_id, vb.version)
        return diff_plans(floor_id, content_a, a, content_b, b)
