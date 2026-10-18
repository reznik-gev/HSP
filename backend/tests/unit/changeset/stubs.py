"""Stubs for the changeset engine tests: the catalog and references a plan can use, and builders
for the raw operations a client sends (docs/0081)."""

import uuid
from typing import Any

import pytest
from pydantic import TypeAdapter

from hsp.models import new_id
from hsp.plans.changeset import AddOp, ChangesetRejected, DeleteOp, Op, UpdateOp
from tests.stubs import stub_catalog_item, stub_references

DESK, CHAIR, MONITOR = new_id(), new_id(), new_id()
ZONE_TYPE, DEVICE = new_id(), new_id()

#: A seat desk, a chair, and a monitor that mounts on desks; one zone type and one device.
REFS = stub_references(
    [
        stub_catalog_item(DESK, "desk", "desk", is_seat=True),
        stub_catalog_item(CHAIR, "chair", "chair"),
        stub_catalog_item(
            MONITOR, "monitor", "monitor", mountable=True, attaches_to_categories=["desk"]
        ),
    ],
    zone_type_ids=frozenset({ZONE_TYPE}),
    device_ids=frozenset({DEVICE}),
)

SQUARE = [(0, 0), (4000, 0), (4000, 4000), (0, 4000)]
BOWTIE = [(0, 0), (1000, 1000), (1000, 0), (0, 1000)]  # self-intersecting

_ops_adapter = TypeAdapter(list[Op])


def ops(*raw: dict[str, Any]) -> list[AddOp | UpdateOp | DeleteOp]:
    return _ops_adapter.validate_python(list(raw))


def add(kind: str, element_id: uuid.UUID, **data: Any) -> dict[str, Any]:
    return {"op": "add", "kind": kind, "id": element_id, "data": data}


def update(kind: str, element_id: uuid.UUID, **data: Any) -> dict[str, Any]:
    return {"op": "update", "kind": kind, "id": element_id, "data": data}


def delete(kind: str, element_id: uuid.UUID) -> dict[str, Any]:
    return {"op": "delete", "kind": kind, "id": element_id}


def wall(a: tuple[int, int] = (0, 0), b: tuple[int, int] = (5000, 0)) -> dict[str, Any]:
    """A 5 m wall along the x axis by default."""
    return {"a": a, "b": b, "thickness_mm": 150, "height_mm": 2800}


def door(wall_id: uuid.UUID, **over: Any) -> dict[str, Any]:
    """A 900 mm door 1 m along `wall_id`."""
    return {
        "wall_id": wall_id,
        "type": "door",
        "offset_mm": 1000,
        "width_mm": 900,
        "height_mm": 2100,
        "swing": "none",
        **over,
    }


def desk(**over: Any) -> dict[str, Any]:
    """An assigned seat desk at (1000, 1000)."""
    return {
        "catalog_item_rev_id": DESK,
        "position": (1000, 1000, 0),
        "allocation_mode": "assigned",
        **over,
    }


def monitor(on: uuid.UUID, **over: Any) -> dict[str, Any]:
    """A monitor on desk height, attached to `on`."""
    return {
        "catalog_item_rev_id": MONITOR,
        "position": (1000, 1100, 740),
        "attached_to": on,
        **over,
    }


def chair(**over: Any) -> dict[str, Any]:
    return {"catalog_item_rev_id": CHAIR, "position": (0, 0, 0), **over}


def zone(name: str = "Z", **over: Any) -> dict[str, Any]:
    """A 4 x 4 m zone of ZONE_TYPE."""
    return {"name": name, "zone_type_id": ZONE_TYPE, "boundary": SQUARE, **over}


def codes(exc: pytest.ExceptionInfo[ChangesetRejected]) -> list[str]:
    return [e.code for e in exc.value.errors]
