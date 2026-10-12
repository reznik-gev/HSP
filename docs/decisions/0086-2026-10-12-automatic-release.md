# 0086 — Free resources automatically instead of asking for confirmation

- **Date:** 2026-10-12
- **Status:** Accepted
- **Amends:** [0078](0078-2026-10-08-archive-semantics.md) (archiving parents), [0082](0082-2026-10-10-publish-discard-restore.md) (choice 6, assigned seats on publish), [0084](0084-2026-10-10-people-org-api-and-import.md) (unit archiving), [0085](0085-2026-10-12-seat-assignment-api.md) (choice 2, taken seats), [0031](0031-2026-10-08-seat-assignment-rules.md), [0034](0034-2026-10-08-v1-data-model.md) (invariant 6), [0017](0017-2026-10-08-people-data-source.md), [0019](0019-2026-10-08-org-unit-source.md)

## Context
While deciding [0085](0085-2026-10-12-seat-assignment-api.md), the product owner stated a principle for the whole product:

> Potential users want operations with as little confirmation as possible, and more automatic reasoning about unassignments. Deletions just free up space and allocations.

Several earlier records asked for confirmation, or refused an operation, in cases where the system can work out the right outcome itself. This record reviews them all and replaces them.

## The principle
- When something is removed, deactivated or archived, **whatever it held is released automatically, in the same transaction**. Examples are a seat, a membership or a child item.
- Every release is **audited**, and the **response says what was released**, so the UI can tell the user ("Maya was unassigned from HT-3-04").
- Nothing is put into a "flagged for review" state. A flag is a dead allocation that every screen must explain.
- **Not affected:** checks that protect data integrity or unsaved work keep refusing:
  - duplicate seat labels
  - a device placed on two floors
  - deleting a device or zone type that floor-plan history uses
  - the edit lock and stale revisions
  - restoring while a draft exists

## Decisions
| # | Situation | Before | Now |
|---|---|---|---|
| 1 | Publishing a draft that removes an assigned seat, or makes it bookable or unavailable | Refused until the seats were confirmed in `unassign_seats` ([0082](0082-2026-10-10-publish-discard-restore.md)) | **Publish goes through and those seats are unassigned**, each one audited. The publish result lists the freed seats and their former holders. `unassign_seats` is removed. |
| 2 | Assigning a seat that already has a holder | `409 seat-taken` unless `replace: true` ([0085](0085-2026-10-12-seat-assignment-api.md)) | **The seat is reassigned.** The previous holder is unassigned (audited), and the response names them. They keep any other seats they hold. |
| 3 | Archiving a site or building that has active children | `409`, archive bottom-up ([0078](0078-2026-10-08-archive-semantics.md)) | **Cascades:** a site archives its active buildings, a building archives its active floors, and each archived floor frees its seats ([0085](0085-2026-10-12-seat-assignment-api.md)). Every archived item is audited, and the response lists them. |
| 3b | Archiving an org unit that has active sub-units | `409` ([0084](0084-2026-10-10-people-org-api-and-import.md)) | **Cascades** to all active sub-units. Each one frees its unit-held seats, and its members move up (decision 4). |
| 4 | Members of an archived unit | Memberships stayed, pointing at the archived unit | **Members move up to the nearest active ancestor**, with each person audited. If they are already a member there, the memberships merge. A primary membership stays primary, so there's still exactly one explicit primary ([0084](0084-2026-10-10-people-org-api-and-import.md)). Positions in the archived unit are dropped. |
| 5 | Devices issued to a person who is deactivated | No rule | **Kept** (the owner's choice). The device still shows who it was issued to, for example to chase laptop returns, and the holder shows as inactive. |

Restoring stays **top-down and one item at a time**:
- Restoring a building doesn't bring back its floors.
- Restoring a unit doesn't bring back its sub-units, members or seats.

Nothing reappears by surprise.

## Consequences
- **Archiving the root unit is refused** (`409 root-unit`). There is no parent for its members to move to, and the organization always has a root ([0006](0006-2026-10-07-org-hierarchy-model.md)).
- **Code already on `main` that changes:**
  - publishing (`unassign_seats`, [0082](0082-2026-10-10-publish-discard-restore.md))
  - site and building archiving ([0078](0078-2026-10-08-archive-semantics.md))
  - unit archiving ([0084](0084-2026-10-10-people-org-api-and-import.md))
- **The freeing rules in [0085](0085-2026-10-12-seat-assignment-api.md)** are built together with the seat assignment API.
- **Future AD sync ([0017](0017-2026-10-08-people-data-source.md), [0019](0019-2026-10-08-org-unit-source.md)):** it follows the same principle:
  - a person disabled in AD is deactivated, and their seats are freed
  - a unit whose AD group is deleted is archived, and the spaces it owned revert to the parent, with no review flag
