"""Which seats exist right now: seats in the published plans of active floors (docs/0028, 0085).

A seat is a placed object whose catalog item is a seat. Assignment, search and occupancy all read
this view; drafts never count.
"""

import uuid
from typing import Any

from sqlalchemy import and_, or_

from hsp import models


def visible_at_published(rev: Any) -> Any:
    """The revision is part of its floor's published version (docs/0028)."""
    f = models.Floor
    return and_(
        f.published_version.is_not(None),
        rev.from_version <= f.published_version,
        or_(rev.to_version.is_(None), rev.to_version > f.published_version),
    )


def published_seats(query: Any, tenant_id: uuid.UUID) -> Any:
    """Restrict a query over `ObjectRev` to seats in published plans of active floors, buildings
    and sites. Joins Floor, Building and Site, so callers can select or filter on them."""
    r, e, f, c = models.ObjectRev, models.FloorElement, models.Floor, models.CatalogItemRev
    b, s = models.Building, models.Site
    return (
        query.join(e, e.id == r.element_id)
        .join(f, f.id == e.floor_id)
        .join(b, b.id == f.building_id)
        .join(s, s.id == b.site_id)
        .join(c, c.id == r.catalog_item_rev_id)
        .where(
            f.tenant_id == tenant_id,
            f.archived_at.is_(None),
            b.archived_at.is_(None),
            s.archived_at.is_(None),
            c.is_seat.is_(True),
            visible_at_published(r),
        )
    )
