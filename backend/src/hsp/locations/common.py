"""Helpers shared by the location services (docs/0033, docs/0037, docs/0078)."""

import uuid
from typing import Any

from hsp.audit import audit_event
from hsp.auth.principal import Principal
from hsp.locations.repository import LocationsRepository
from hsp.problems import ProblemError, ProblemException


def not_found(kind: str, entity_id: uuid.UUID) -> ProblemException:
    return ProblemException(
        404, "not-found", "Not found", f"{kind.capitalize()} {entity_id} does not exist."
    )


def archived_read_only(kind: str) -> ProblemException:
    return ProblemException(
        409, "archived", "Archived", f"Restore the {kind} before editing it (docs/0078)."
    )


def has_active_children(
    kind: str, child_kind: str, children: list[tuple[uuid.UUID, str]]
) -> ProblemException:
    return ProblemException(
        409,
        "has-active-children",
        f"{kind.capitalize()} has active {child_kind}s",
        f"Archive its {child_kind}s first (docs/0078).",
        errors=[
            ProblemError(code="active_child", message=label, element_id=str(child_id))
            for child_id, label in children
        ],
    )


def parent_archived(kind: str, parent_kind: str) -> ProblemException:
    return ProblemException(
        409,
        "parent-archived",
        f"{parent_kind.capitalize()} is archived",
        f"Restore the {parent_kind} before adding or restoring a {kind} in it (docs/0078).",
    )


def invalid_field(code: str, message: str, pointer: str) -> ProblemException:
    return ProblemException(
        422,
        "request-invalid",
        "Request validation failed",
        errors=[ProblemError(code=code, message=message, pointer=pointer)],
    )


def record(
    repo: LocationsRepository,
    principal: Principal,
    request_id: str | None,
    *,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> None:
    repo.record(
        audit_event(
            principal,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            before=before,
            after=after,
            request_id=request_id,
        )
    )
