"""Stub test data shared by unit tests: plain values the code under test reads (docs/0061).

Named after the usual test-double terms: a stub supplies canned data, while the in-memory
repositories in tests/fakes.py are fakes with working behaviour.
"""

import uuid
from typing import Any

from hsp.models import new_id
from hsp.plans.changeset import References
from hsp.plans.schema import CatalogItem


def stub_catalog_item(rev: uuid.UUID, key: str, category: str, **over: Any) -> CatalogItem:
    """A 600 x 600 mm catalog item that takes floor space; `over` sets any other field."""
    return CatalogItem.model_validate(
        {
            "id": rev,
            "item_id": new_id(),
            "key": key,
            "category": category,
            "name": key.title(),
            "shape": "box",
            "width_mm": 600,
            "depth_mm": 600,
            "height_mm": 700,
            "color": None,
            "is_seat": False,
            "mountable": False,
            "attaches_to_categories": [],
            "footprint_blocks": True,
            **over,
        }
    )


def stub_references(
    catalog: list[CatalogItem],
    zone_type_ids: frozenset[uuid.UUID] = frozenset(),
    device_ids: frozenset[uuid.UUID] = frozenset(),
) -> References:
    """What exists outside a plan: its catalog items, zone types and devices."""
    return References(
        catalog={item.id: item for item in catalog},
        zone_type_ids=zone_type_ids,
        device_ids=device_ids,
    )
