"""The shared validation cases (shared/validation-cases, docs/0051, docs/0092), run against the
server's checks. The editor's TypeScript checker runs the same files, so the two agree.

The fixtures turn a case's JSON into the server's models; the test itself only runs `validate`
and compares what it finds. Cases use short ids ("w1", "desk"); the models need UUIDs, so ids
are mapped to UUIDs (uuid5 of the name) and findings mapped back.
"""

import json
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest

from hsp.plans.changeset import References, validate
from hsp.plans.schema import CatalogItem, PlanContent
from tests.stubs import stub_references

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

#: (code, element name, severity), as a case's `expect` lists them.
Finding = tuple[str, str | None, str]


@dataclass(frozen=True)
class Case:
    """One case with the defaults of its file (catalog, zone types, devices) applied."""

    plan: dict[str, Any]
    catalog: dict[str, Any]
    zone_types: list[str]
    devices: list[str]
    expect: list[dict[str, Any]]


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


def _load_cases() -> list[Any]:
    found = []
    for path in sorted(CASES_DIR.glob("*.json")):
        group = json.loads(path.read_text(encoding="utf-8"))
        for raw in group["cases"]:
            case = Case(
                plan=raw["plan"],
                catalog={**group.get("catalog", {}), **raw["plan"].get("catalog", {})},
                zone_types=group.get("zone_types", []),
                devices=group.get("devices", []),
                expect=raw["expect"],
            )
            found.append(pytest.param(case, id=f"{path.stem}: {raw['name']}"))
    return found


@pytest.fixture(params=_load_cases())
def case(request: pytest.FixtureRequest) -> Case:
    return request.param  # type: ignore[no-any-return]


@pytest.fixture
def content(case: Case) -> PlanContent:
    """The case's plan as the server stores it."""
    return PlanContent.model_validate(
        {
            **{key: _ids(case.plan.get(key, [])) for key in LISTS},
            "catalog": {str(_uuid(k)): _ids(v) for k, v in case.catalog.items()},
        }
    )


@pytest.fixture
def refs(case: Case) -> References:
    """What exists outside the plan, for this case."""
    return stub_references(
        [CatalogItem.model_validate(_ids(v)) for v in case.catalog.values()],
        zone_type_ids=frozenset(_uuid(z) for z in case.zone_types),
        device_ids=frozenset(_uuid(d) for d in case.devices),
    )


@pytest.fixture
def names(case: Case) -> dict[str, str]:
    """Element UUIDs back to the case's short names."""
    return {str(_uuid(e["id"])): e["id"] for key in LISTS for e in case.plan.get(key, [])}


@pytest.fixture
def expected(case: Case) -> list[Finding]:
    return sorted((e["code"], e["element_id"], e.get("severity", "error")) for e in case.expect)


def test_case(
    content: PlanContent, refs: References, names: dict[str, str], expected: list[Finding]
) -> None:
    found = sorted(
        (p.code, names.get(p.element_id or "", p.element_id), "error")
        for p in validate(content, refs)
    )
    assert found == expected
