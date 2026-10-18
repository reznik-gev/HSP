"""Stub test data shared by unit tests: plain values the code under test reads (docs/0061).

Named after the usual test-double terms: a stub supplies canned data, while the in-memory
repositories in tests/fakes.py are fakes with working behaviour.
"""

import uuid
from typing import Any

from hsp.auth.principal import ADMIN_ROLE, Principal
from hsp.models import new_id
from hsp.plans.changeset import References
from hsp.plans.schema import CatalogItem, PlacedObject

#: The tenant of the unit tests' signed-in users. Database tests use the database's tenants.
STUB_TENANT = new_id()
STUB_CSRF_TOKEN = "csrf"
#: The header a write request needs (docs/0038).
STUB_CSRF_HEADER_NAME = "X-CSRF-Token"


def stub_admin(
    tenant: uuid.UUID = STUB_TENANT, subject: str = "alice", name: str = "Alice"
) -> Principal:
    """A signed-in admin; `subject` and `name` tell several admins apart."""
    return Principal(
        subject, name, None, frozenset({ADMIN_ROLE}), tenant, new_id(), STUB_CSRF_TOKEN
    )


def stub_viewer(
    tenant: uuid.UUID = STUB_TENANT, subject: str = "vic", name: str = "Vic"
) -> Principal:
    """A signed-in user without the admin role: read-only (docs/0027)."""
    return Principal(subject, name, None, frozenset(), tenant, new_id(), STUB_CSRF_TOKEN)


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


def stub_placed_object(rev: uuid.UUID, **over: Any) -> PlacedObject:
    """An object of catalog revision `rev` at the origin, as a stored plan holds it; `over` sets
    its id, position, label or any other field."""
    return PlacedObject.model_validate(
        {"id": new_id(), "catalog_item_rev_id": rev, "position": (0, 0, 0), **over}
    )
