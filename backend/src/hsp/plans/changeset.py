"""The changeset engine (docs/0036, docs/0081): apply add/update/delete operations to a draft's
content in memory and check the core rules. Pure: no I/O, so every rule is unit-tested directly.
Persistence (version-range writes, docs/0028) happens elsewhere, from the returned effects.
"""

import contextlib
import math
import uuid
from collections.abc import Iterable, Mapping, Set
from dataclasses import dataclass, field
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, ValidationError
from shapely.geometry import Polygon

from hsp.plans.schema import (
    CatalogItem,
    Column,
    Opening,
    PlacedObject,
    PlanContent,
    Point2,
    Wall,
    Zone,
)
from hsp.problems import ProblemError

Kind = Literal["wall", "opening", "column", "zone", "object"]
KINDS: tuple[Kind, ...] = ("wall", "opening", "column", "zone", "object")
ATTR: dict[Kind, str] = {
    "wall": "walls",
    "opening": "openings",
    "column": "columns",
    "zone": "zones",
    "object": "objects",
}
Element = Wall | Opening | Column | Zone | PlacedObject
MODEL: dict[Kind, type[Element]] = {
    "wall": Wall,
    "opening": Opening,
    "column": Column,
    "zone": Zone,
    "object": PlacedObject,
}


class AddOp(BaseModel):
    op: Literal["add"]
    kind: Kind
    id: uuid.UUID = Field(description="Client-generated UUIDv7 (docs/0035)")
    data: dict[str, Any]


class UpdateOp(BaseModel):
    op: Literal["update"]
    kind: Kind
    id: uuid.UUID
    data: dict[str, Any] = Field(description="Only the fields that change")


class DeleteOp(BaseModel):
    op: Literal["delete"]
    kind: Kind
    id: uuid.UUID


Op = Annotated[AddOp | UpdateOp | DeleteOp, Field(discriminator="op")]


class ChangesetIn(BaseModel):
    base_revision: int = Field(ge=0, description="The draft revision the client edited (0 = new)")
    ops: list[Op] = Field(min_length=1, max_length=5000)


class CascadedDelete(BaseModel):
    kind: Kind
    id: uuid.UUID


@dataclass(frozen=True)
class References:
    """Things outside the plan that elements may point to, loaded by the caller."""

    catalog: Mapping[uuid.UUID, CatalogItem]
    zone_type_ids: frozenset[uuid.UUID]
    device_ids: frozenset[uuid.UUID]


@dataclass
class ChangesetEffects:
    content: PlanContent
    #: Final state of every added or updated element.
    upserted: dict[tuple[Kind, uuid.UUID], Element] = field(default_factory=dict)
    #: Elements removed by this changeset (explicitly or by cascade).
    deleted: set[tuple[Kind, uuid.UUID]] = field(default_factory=set)
    cascaded: list[CascadedDelete] = field(default_factory=list)


class ChangesetRejected(Exception):
    def __init__(self, errors: list[ProblemError]) -> None:
        super().__init__(f"{len(errors)} problem(s)")
        self.errors = errors


def needed_references(
    content: PlanContent, ops: Iterable[AddOp | UpdateOp | DeleteOp]
) -> tuple[set[uuid.UUID], set[uuid.UUID], set[uuid.UUID]]:
    """Catalog revision, zone type and device ids that the content and ops refer to."""
    catalog = {o.catalog_item_rev_id for o in content.objects}
    zone_types = {z.zone_type_id for z in content.zones}
    devices = {o.device_id for o in content.objects if o.device_id}
    for op in ops:
        if isinstance(op, AddOp | UpdateOp):
            for key, bucket in (
                ("catalog_item_rev_id", catalog),
                ("zone_type_id", zone_types),
                ("device_id", devices),
            ):
                value = op.data.get(key)
                if value:
                    # A malformed id is reported as invalid_field when the op is applied.
                    with contextlib.suppress(ValueError):
                        bucket.add(uuid.UUID(str(value)))
    return catalog, zone_types, devices


def _err(
    code: str,
    message: str,
    *,
    op_index: int | None = None,
    element_id: uuid.UUID | None = None,
    related: Iterable[uuid.UUID] = (),
    pointer: str | None = None,
) -> ProblemError:
    rel = [str(r) for r in related]
    return ProblemError(
        code=code,
        message=message,
        op_index=op_index,
        element_id=str(element_id) if element_id else None,
        related_ids=rel or None,
        pointer=pointer,
    )


def _field_errors(exc: ValidationError, op_index: int, element_id: uuid.UUID) -> list[ProblemError]:
    return [
        _err(
            "invalid_field",
            str(e["msg"]),
            op_index=op_index,
            element_id=element_id,
            pointer=f"/ops/{op_index}/data/" + "/".join(str(p) for p in e["loc"]),
        )
        for e in exc.errors()
    ]


def apply_changeset(
    content: PlanContent, ops: list[AddOp | UpdateOp | DeleteOp], refs: References
) -> ChangesetEffects:
    """Apply `ops` in order; raise ChangesetRejected with every problem found, or return effects."""
    state: dict[Kind, dict[uuid.UUID, Element]] = {
        k: {e.id: e for e in getattr(content, ATTR[k])} for k in KINDS
    }
    effects = ChangesetEffects(content=content)
    touched: dict[uuid.UUID, int] = {}  # element id -> op index that last touched it
    deleted_by: dict[uuid.UUID, int] = {}  # element id -> op index that deleted it
    cascaded_ids: set[uuid.UUID] = set()
    errors: list[ProblemError] = []

    def exists_anywhere(element_id: uuid.UUID) -> bool:
        return any(element_id in s for s in state.values())

    def remove(kind: Kind, element_id: uuid.UUID, op_index: int, *, cascade: bool) -> None:
        state[kind].pop(element_id, None)
        effects.upserted.pop((kind, element_id), None)
        effects.deleted.add((kind, element_id))
        deleted_by[element_id] = op_index
        if cascade:
            cascaded_ids.add(element_id)
            effects.cascaded.append(CascadedDelete(kind=kind, id=element_id))
        if kind == "wall":  # a wall takes its openings with it
            for o in _of(state["opening"], Opening):
                if o.wall_id == element_id:
                    remove("opening", o.id, op_index, cascade=True)
        if kind == "object":  # an object takes what is attached to it (monitors on a desk)
            for p in _of(state["object"], PlacedObject):
                if p.attached_to == element_id:
                    remove("object", p.id, op_index, cascade=True)

    for i, op in enumerate(ops):
        kind_state = state[op.kind]
        if isinstance(op, AddOp):
            if exists_anywhere(op.id) or op.id in deleted_by:
                errors.append(
                    _err(
                        "duplicate_id",
                        f"Element {op.id} already exists.",
                        op_index=i,
                        element_id=op.id,
                    )
                )
                continue
            try:
                model = MODEL[op.kind](**{**op.data, "id": op.id})
            except ValidationError as exc:
                errors += _field_errors(exc, i, op.id)
                continue
            kind_state[op.id] = model
            effects.upserted[(op.kind, op.id)] = model
            touched[op.id] = i
        elif isinstance(op, UpdateOp):
            existing = kind_state.get(op.id)
            if existing is None:
                errors.append(
                    _err(
                        "unknown_element",
                        f"No {op.kind} {op.id} in the draft.",
                        op_index=i,
                        element_id=op.id,
                    )
                )
                continue
            try:
                model = MODEL[op.kind](**{**existing.model_dump(), **op.data, "id": op.id})
            except ValidationError as exc:
                errors += _field_errors(exc, i, op.id)
                continue
            kind_state[op.id] = model
            effects.upserted[(op.kind, op.id)] = model
            touched[op.id] = i
        else:
            if op.id in cascaded_ids:
                continue  # already removed by an earlier cascade in this changeset
            if op.id not in kind_state:
                errors.append(
                    _err(
                        "unknown_element",
                        f"No {op.kind} {op.id} in the draft.",
                        op_index=i,
                        element_id=op.id,
                    )
                )
                continue
            remove(op.kind, op.id, i, cascade=False)
            touched[op.id] = i

    if errors:
        raise ChangesetRejected(errors)

    final = PlanContent(
        walls=_of(state["wall"], Wall),
        openings=_of(state["opening"], Opening),
        columns=_of(state["column"], Column),
        zones=_of(state["zone"], Zone),
        objects=_of(state["object"], PlacedObject),
    )
    problems = validate(final, refs, deleted=set(deleted_by))
    # Only report problems this changeset is responsible for: it touched the element or a
    # related one. An old element that predates a rule must never block every later save.
    relevant = set(touched) | set(deleted_by)
    blocking = []
    for p in problems:
        ids = {uuid.UUID(x) for x in [p.element_id or "", *(p.related_ids or [])] if x}
        hit = [touched.get(x, deleted_by.get(x)) for x in ids if x in relevant]
        if hit:
            p.op_index = next((h for h in hit if h is not None), None)
            blocking.append(p)
    if blocking:
        raise ChangesetRejected(blocking)

    used = {o.catalog_item_rev_id for o in final.objects}
    final.catalog = {str(k): v for k, v in refs.catalog.items() if k in used}
    effects.content = final
    return effects


def _of[E: Element](elements: dict[uuid.UUID, Element], cls: type[E]) -> list[E]:
    """The elements of one kind, typed, in a stable (id) order."""
    return sorted((e for e in elements.values() if isinstance(e, cls)), key=lambda e: e.id)


def _polygon_ok(points: list[Point2]) -> bool:
    if len(set(points)) < 3:
        return False
    poly = Polygon(points)
    return bool(poly.is_valid and poly.area > 0)


def validate(
    plan: PlanContent, refs: References, *, deleted: Set[uuid.UUID] = frozenset()
) -> list[ProblemError]:
    """Every core rule of docs/0081 over a whole plan. Returns problems (op_index unset)."""
    problems: list[ProblemError] = []
    walls = {w.id: w for w in plan.walls}
    zones = {z.id: z for z in plan.zones}
    objects = {o.id: o for o in plan.objects}

    for w in plan.walls:
        if w.a == w.b:
            problems.append(
                _err("wall_degenerate", "A wall needs two different endpoints.", element_id=w.id)
            )

    for opening in plan.openings:
        wall = walls.get(opening.wall_id)
        if wall is None:
            problems.append(
                _err(
                    "reference_missing",
                    f"Wall {opening.wall_id} doesn't exist.",
                    element_id=opening.id,
                    related=[opening.wall_id],
                )
            )
            continue
        length = math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1])
        if opening.offset_mm + opening.width_mm > length + 1e-9:
            problems.append(
                _err(
                    "opening_exceeds_wall",
                    f"{opening.type.capitalize()} ends "
                    f"{round(opening.offset_mm + opening.width_mm - length)} mm past the wall end.",
                    element_id=opening.id,
                    related=[wall.id],
                )
            )

    for c in plan.columns:
        if not _polygon_ok(c.footprint):
            problems.append(
                _err("polygon_invalid", "Column footprint is not a valid polygon.", element_id=c.id)
            )

    for z in plan.zones:
        if not _polygon_ok(z.boundary):
            problems.append(
                _err("polygon_invalid", "Zone boundary is not a valid polygon.", element_id=z.id)
            )
        if z.zone_type_id not in refs.zone_type_ids:
            problems.append(
                _err(
                    "reference_missing",
                    f"Zone type {z.zone_type_id} doesn't exist.",
                    element_id=z.id,
                )
            )
        if z.parent_zone_id is None:
            continue
        if z.parent_zone_id in deleted:
            problems.append(
                _err(
                    "zone_has_children",
                    "Delete or re-parent the child zones before deleting their parent.",
                    element_id=z.id,
                    related=[z.parent_zone_id],
                )
            )
            continue
        if z.parent_zone_id not in zones:
            problems.append(
                _err(
                    "reference_missing",
                    f"Parent zone {z.parent_zone_id} doesn't exist.",
                    element_id=z.id,
                    related=[z.parent_zone_id],
                )
            )
            continue
        seen, cursor = {z.id}, zones.get(z.parent_zone_id)
        while cursor is not None:
            if cursor.id in seen:
                problems.append(
                    _err(
                        "zone_cycle",
                        "Zones are nested in a cycle.",
                        element_id=z.id,
                        related=[z.parent_zone_id],
                    )
                )
                break
            seen.add(cursor.id)
            cursor = zones.get(cursor.parent_zone_id) if cursor.parent_zone_id else None

    device_owner: dict[uuid.UUID, uuid.UUID] = {}
    for obj in plan.objects:
        item = refs.catalog.get(obj.catalog_item_rev_id)
        if item is None:
            problems.append(
                _err(
                    "reference_missing",
                    f"Catalog item {obj.catalog_item_rev_id} doesn't exist.",
                    element_id=obj.id,
                )
            )
            continue
        if obj.position[2] != 0 and not item.mountable:
            problems.append(
                _err(
                    "not_mountable",
                    f"{item.name} sits on the floor (z must be 0).",
                    element_id=obj.id,
                )
            )
        if item.is_seat and obj.allocation_mode is None:
            problems.append(
                _err(
                    "allocation_mode_required", "Seats need an allocation mode.", element_id=obj.id
                )
            )
        if not item.is_seat and obj.allocation_mode is not None:
            problems.append(
                _err("allocation_mode_not_seat", f"{item.name} is not a seat.", element_id=obj.id)
            )
        if obj.attached_to is not None:
            host = objects.get(obj.attached_to)
            if host is None:
                problems.append(
                    _err(
                        "reference_missing",
                        f"Host object {obj.attached_to} doesn't exist.",
                        element_id=obj.id,
                        related=[obj.attached_to],
                    )
                )
            else:
                host_item = refs.catalog.get(host.catalog_item_rev_id)
                if (
                    host.id == obj.id
                    or host_item is None
                    or host_item.category not in item.attaches_to_categories
                ):
                    problems.append(
                        _err(
                            "attach_not_allowed",
                            f"{item.name} can't be attached to "
                            f"{host_item.name if host_item else 'that object'}.",
                            element_id=obj.id,
                            related=[host.id],
                        )
                    )
        if obj.device_id is not None:
            if obj.device_id not in refs.device_ids:
                problems.append(
                    _err(
                        "reference_missing",
                        f"Device {obj.device_id} doesn't exist.",
                        element_id=obj.id,
                    )
                )
            elif obj.device_id in device_owner:
                problems.append(
                    _err(
                        "device_placed_twice",
                        "This device is already placed on the floor.",
                        element_id=obj.id,
                        related=[device_owner[obj.device_id]],
                    )
                )
            else:
                device_owner[obj.device_id] = obj.id
    return problems
