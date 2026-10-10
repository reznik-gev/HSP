"""Diff two plan versions element by element (docs/0080).

Elements are matched by their stable id (docs/0028), so a moved desk is `changed` (position),
not removed + added. Pure function: no I/O, unit-tested directly.
"""

import uuid
from typing import Any

from pydantic import BaseModel

from hsp.plans.schema import KINDS, ElementChange, KindDiff, PlanContent, PlanDiff


def _kind_diff(a: list[BaseModel], b: list[BaseModel]) -> KindDiff:
    before = {e.id: e.model_dump(mode="json") for e in a}  # type: ignore[attr-defined]
    after = {e.id: e.model_dump(mode="json") for e in b}  # type: ignore[attr-defined]
    diff = KindDiff(
        added=[after[i] for i in after if i not in before],
        removed=[before[i] for i in before if i not in after],
    )
    for element_id in before.keys() & after.keys():
        old, new = before[element_id], after[element_id]
        fields = sorted(k for k in old.keys() | new.keys() if old.get(k) != new.get(k))
        if fields:
            diff.changed.append(
                ElementChange(
                    id=uuid.UUID(str(element_id)),
                    before={k: old.get(k) for k in fields},
                    after={k: new.get(k) for k in fields},
                )
            )
    diff.changed.sort(key=lambda c: c.id)
    return diff


def diff_plans(
    floor_id: uuid.UUID, a: PlanContent, from_version: int, b: PlanContent, to_version: int
) -> PlanDiff:
    kinds: dict[str, Any] = {kind: _kind_diff(getattr(a, kind), getattr(b, kind)) for kind in KINDS}
    return PlanDiff(floor_id=floor_id, from_version=from_version, to_version=to_version, **kinds)
