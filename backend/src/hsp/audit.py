"""Building audit events (docs/0033). Written by services in the same transaction as the change."""

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi.encoders import jsonable_encoder

from hsp.auth.principal import Principal
from hsp.models import AuditEvent, new_id


def changed_fields(
    before: dict[str, Any], after: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Reduce full snapshots to the fields that changed (docs/0033: changed fields only)."""
    keys = sorted(k for k in before.keys() | after.keys() if before.get(k) != after.get(k))
    return {k: before.get(k) for k in keys}, {k: after.get(k) for k in keys}


def audit_event(
    principal: Principal,
    *,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    request_id: str | None = None,
    reason: str | None = None,
) -> AuditEvent:
    return AuditEvent(
        id=new_id(),
        tenant_id=principal.tenant_id,
        occurred_at=datetime.now(UTC),
        actor_subject=principal.subject,
        actor_person_id=None,  # linked once people are imported (docs/0027)
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before=jsonable_encoder(before) if before is not None else None,
        after=jsonable_encoder(after) if after is not None else None,
        request_id=request_id,
        reason=reason,
    )
