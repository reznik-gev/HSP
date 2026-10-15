"""The shared validation cases (shared/validation-cases, docs/0051, docs/0092), run against the
server's checks. The editor's TypeScript checker runs the same files, so the two agree.

Cases use short ids ("w1", "desk"); the models need UUIDs, so ids are mapped to UUIDs here
(uuid5 of the name) and findings mapped back.
"""

import json
import uuid
from pathlib import Path
from typing import Any

import pytest

from hsp.plans.changeset import References, validate
from hsp.plans.schema import CatalogItem, PlanContent

CASES_DIR = Path(__file__).resolve().parents[3] / "shared" / "validation-cases"
LISTS = ("walls", "openings", "columns", "zones", "objects")
#: Fields that hold an id or a reference to one.
ID_FIELDS = {
    "id",
    "item_id",
    "wall_id",
    "zone_type_id",
    "parent_zone_id",
    "catalog_item_rev_id",
    "attached_to",
    "device_id",
}


def _uuid(name: str) -> uuid.UUID:
    return uuid.uuid5(uuid.NAMESPACE_OID, name)


def _ids(value: Any) -> Any:
    """`value` with every id field's name replaced by its UUID string."""
    if isinstance(value, dict):
        return {
            k: (str(_uuid(v)) if k in ID_FIELDS and isinstance(v, str) else _ids(v))
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [_ids(v) for v in value]
    return value


def _cases() -> list[Any]:
    found = []
    for path in sorted(CASES_DIR.glob("*.json")):
        group = json.loads(path.read_text(encoding="utf-8"))
        for case in group["cases"]:
            found.append(pytest.param(group, case, id=f"{path.stem}: {case['name']}"))
    return found


@pytest.mark.parametrize(("group", "case"), _cases())
def test_case(group: dict[str, Any], case: dict[str, Any]) -> None:
    plan = case["plan"]
    catalog = {**group.get("catalog", {}), **plan.get("catalog", {})}
    content = PlanContent.model_validate(
        {
            **{key: _ids(plan.get(key, [])) for key in LISTS},
            "catalog": {str(_uuid(k)): _ids(v) for k, v in catalog.items()},
        }
    )
    refs = References(
        catalog={_uuid(k): CatalogItem.model_validate(_ids(v)) for k, v in catalog.items()},
        zone_type_ids=frozenset(_uuid(z) for z in group.get("zone_types", [])),
        device_ids=frozenset(_uuid(d) for d in group.get("devices", [])),
    )
    names = {str(_uuid(e["id"])): e["id"] for key in LISTS for e in plan.get(key, [])}
    found = sorted(
        (p.code, names.get(p.element_id or "", p.element_id), "error")
        for p in validate(content, refs)
    )
    expected = sorted(
        (e["code"], e["element_id"], e.get("severity", "error")) for e in case["expect"]
    )
    assert found == expected
