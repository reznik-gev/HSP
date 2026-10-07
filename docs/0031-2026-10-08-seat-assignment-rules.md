# 0031 — Seat assignment rules: current-only, held by a person or a unit

- **Date:** 2026-10-08
- **Status:** Accepted
- **Refines:** [0009](0009-2026-10-07-seat-assignment-model.md)

## Options considered
**Time model:**
- Dated assignments (`valid_from`/`valid_to`, future moves)
- **Current-only + history log** ✅
- Dated, one seat per person

**Holder:**
- **Person or unit** ✅
- Person only

## Decision
- A seat has **at most one current assignment** (`UNIQUE(seat_element_id)`).
- The **holder** is exactly one of a **person** or an **org unit** (`CHECK` that exactly one is non-null). A unit-held seat is reserved for that unit with no named occupant.
- A person **may hold several seats** (for example at two sites). Nothing limits a person to one seat.
- Reassigning or unassigning replaces or deletes the current row. Every change is written to the **audit log** ([0033](0033-2026-10-08-audit-logging.md)), which answers "who sat here before?".
- Only seats in the floor's **published** version with `allocation_mode = assigned` can be assigned. A seat that exists only in a draft can't be.

## Consequences
- No future-dated moves in v1. A planned move is executed on the day it happens. Dated assignments can be added later by adding validity columns and replacing the unique constraint with an exclusion constraint.
- Assignment references the seat's **stable element ID** ([0028](0028-2026-10-08-floor-version-storage.md)), so moving a seat in a new floor version keeps its occupant.
- Publish-time conflict check ([0015](0015-2026-10-08-floor-plan-versioning.md)): if the draft deletes an assigned seat, or changes its mode to bookable or unavailable, the publisher must unassign or reassign first.
- Archiving a person (inactive) or a unit flags their seats for reallocation rather than deleting the assignments.
