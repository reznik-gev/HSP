# 0081 — Drafts and changesets: numbering, auto-create, rules

- **Date:** 2026-10-10
- **Status:** Accepted
- **Refines:** [0015](0015-2026-10-08-floor-plan-versioning.md), [0016](0016-2026-10-08-edit-concurrency.md), [0028](0028-2026-10-08-floor-version-storage.md), [0036](0036-2026-10-08-floor-plan-io.md), [0076](0076-2026-10-08-backend-delivery-plan.md)

## Decisions
| Question | Options considered | Decision |
|---|---|---|
| Numbering after a discarded draft | **Delete the discarded draft's record** ✅ / keep discarded drafts, next number = max + 1 | **Discarding deletes the draft's version row**: its revisions are undone ([0028](0028-2026-10-08-floor-version-storage.md)), and the audit log records the discard. The next draft reuses the number, so history has **no gaps**. The `discarded` state from [0034](0034-2026-10-08-v1-data-model.md) stays unused. |
| Starting a draft | **Auto-create on the first changeset** ✅ / explicit `POST /draft` first | **The first changeset creates the draft** (with `base_revision: 0`). `POST /floors/{id}/draft` still exists to start one explicitly, for example for a restore ([0015](0015-2026-10-08-floor-plan-versioning.md)). |
| PR split | **Two stacked PRs** ✅ / one PR / three PRs | (a) The **changeset engine**: pure, unit-tested functions. (b) **Saving and endpoints**: version-range writes, lock check, revision counter, DB tests. |

## Changeset rules
- **Draft number** is `published_version + 1`, or `1` for a never-published floor.
- **Writing needs the edit lock** ([0016](0016-2026-10-08-edit-concurrency.md)). If someone else holds it the answer is `423 floor-locked`. If nobody holds a valid lock it's `409 lock-required`.
- **Stale saves:** a changeset whose `base_revision` doesn't match the draft's current revision is refused with `409 stale-revision` ([0036](0036-2026-10-08-floor-plan-io.md)).
- **Operations:** `add` (the client supplies the element id), `update` (only the changed fields), `delete`. All operations apply together or not at all.
- **Cascades:**
  - Deleting a wall deletes its openings.
  - Deleting an object deletes the objects attached to it (monitors on a desk).
  - Deleting a zone that still has child zones is refused, unless the children are deleted in the same changeset.
  - The response lists every cascaded deletion.
- **Core validation** per [0076](0076-2026-10-08-backend-delivery-plan.md). Every error carries a stable `code` plus the `op_index` and `element_id` ([0037](0037-2026-10-08-api-errors.md)):

  | Code | Rule |
  |---|---|
  | `duplicate_id` / `unknown_element` | An `add` reuses an existing id, or an `update`/`delete` targets an element that doesn't exist |
  | `invalid_field` | A field fails type or range checks: whole millimetres, positive dimensions, rotation 0–3599 |
  | `wall_degenerate` | A wall's two endpoints are equal |
  | `polygon_invalid` | A zone or column polygon has fewer than 3 points, intersects itself, or is otherwise invalid |
  | `reference_missing` | A wall, parent zone, zone type, catalog item, attachment host or device doesn't exist |
  | `opening_exceeds_wall` | `offset_mm + width_mm` is longer than the wall (also re-checked when a wall is shortened) |
  | `attach_not_allowed` | The host's category isn't in the attached item's `attaches_to_categories` ([0021](0021-2026-10-08-object-catalog.md)) |
  | `not_mountable` | `z ≠ 0` on an item that isn't mountable |
  | `allocation_mode_required` / `allocation_mode_not_seat` | A seat without an allocation mode, or a non-seat with one |
  | `device_placed_twice` | The same device is placed twice on the floor |
  | `zone_has_children` / `zone_cycle` | Deleting a parent zone without its children, or zones nested in a cycle |

- **Checked at publish instead (step 7):** seat-label uniqueness within the building, and a device placed on more than one floor.
- **Deferred to the editor phase** ([0076](0076-2026-10-08-backend-delivery-plan.md)): zone overlap and nesting geometry, and clearance warnings.
- **Response:** `{revision, cascaded: [{kind, id}], warnings: []}`. Warnings are reserved for non-blocking checks ([0051](0051-2026-10-08-validation-feedback.md)).
- **Audit:** creating a draft is audited. Individual element edits are not, because version history records them ([0033](0033-2026-10-08-audit-logging.md)).
