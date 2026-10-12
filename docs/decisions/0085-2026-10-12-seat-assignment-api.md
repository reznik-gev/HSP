# 0085 — Seat assignment API, search, occupancy and bulk assignment

- **Date:** 2026-10-12
- **Status:** Accepted
- **Refines:** [0009](0009-2026-10-07-seat-assignment-model.md), [0025](0025-2026-10-08-v1-scope.md), [0031](0031-2026-10-08-seat-assignment-rules.md), [0078](0078-2026-10-08-archive-semantics.md)
- **Overrides:** part of [0031](0031-2026-10-08-seat-assignment-rules.md). See [What this changes in 0031](#what-this-changes-in-0031).

## Context
v1 includes permanent seat assignment, "where does X sit?" and occupancy views ([0025](0025-2026-10-08-v1-scope.md)). [0031](0031-2026-10-08-seat-assignment-rules.md) already fixed the core rules:
- each seat has at most one current holder
- the holder is a person or a unit
- a person may hold several seats
- only published seats in `assigned` mode can be assigned
- history comes from the audit log

This record decides how the API behaves.

## Decisions
| # | Question | Options | Chosen |
|---|---|---|---|
| 1 | API shape | **`PUT /seats/{seat_id}/assignment`** / a `POST /seat-assignments` collection | **The assignment is a property of the seat.** `PUT` sets the holder, `DELETE` frees the seat and `GET` reads it. This matches "one current holder per seat". |
| 2 | Assigning a seat that already has a holder | Refuse unless replacing explicitly / **reassign automatically** | **The seat is reassigned.** The previous holder is unassigned, both are in the audit log, and the response names who was replaced ([0086](0086-2026-10-12-automatic-release.md); first chosen as `409` plus `replace: true`, then changed the same day). |
| 3 | Assigning to an inactive person or archived unit | **Refuse** / allow with a warning | **`422 holder-inactive`.** Seats go only to active people and active units. |
| 4 | A person is deactivated | Flag their seats (computed or stored) / **free them** | **Their seats are freed in the same transaction.** Each one is audited as `seat.unassigned` with the reason. Deactivated people are not part of the organization, so their resources are released. Reactivating someone does **not** give their seats back. |
| 4b | A unit is archived | **Free its unit-held seats** / keep them flagged | **Freed, the same way as for people.** Restoring the unit doesn't bring the seats back. Seats held by the unit's *members* are not affected: members keep their seats and move up to the parent unit ([0086](0086-2026-10-12-automatic-release.md)). |
| 5 | "Where does X sit?" | **One search over person, unit and seat label** / people only | **`GET /seats?q=`** matches the holder's name or email, the holding unit's name, and the seat label. Each result shows the seat label, site › building › floor, and the holder with their primary unit. Any logged-in user can search ([0027](0027-2026-10-08-v1-interim-people-and-access.md)). |
| 6 | Occupancy views | Per floor / floor and unit / **floor, unit, and building and site rollups** | **Counts per floor, rolled up per building and per site, and per unit.** The categories are total, assigned to people, reserved for units, free, bookable and unavailable. Per unit, the counts are seats held by the unit and by its members, optionally including sub-units. |
| 7 | Bulk assignment | **A batch endpoint and a CSV/XLSX import** / batch only / single seat only | **`POST /seat-assignments/batch`** applies assign, unassign and swap steps, all or nothing (team moves and swaps). **`POST /imports/seat-assignments`** takes columns `seat_label`*, plus `building_code` and either `holder_email` or `holder_unit_external_id`. It has the same dry-run-first, all-or-nothing flow as the people import ([0084](0084-2026-10-10-people-org-api-and-import.md)). |
| 8 | Archiving a floor that has assigned seats | Refuse / warn and confirm / **free them** | **Its seats are freed in the same transaction**, each one audited. The floor is out of use, so its seats are too. Restoring the floor doesn't bring the assignments back. |

Writes need hsp-admin and CSRF ([0027](0027-2026-10-08-v1-interim-people-and-access.md)).

## What this changes in 0031
[0031](0031-2026-10-08-seat-assignment-rules.md) said:
> Archiving a person (inactive) or a unit flags their seats for reallocation rather than deleting the assignments.

**This is overridden on purpose:**
- Deactivating a person, archiving a unit or archiving a floor now **frees** the affected seats.
- What remains of "who sat here?" is the audit history, which [0031](0031-2026-10-08-seat-assignment-rules.md) already made the source of seat history.
- The rest of 0031 still applies.

The reasoning: a person who left, a unit that no longer exists or a floor that's out of use holds no resources. Keeping their seats "flagged" would leave dead assignments that make occupancy numbers wrong and that every screen must explain.

The same day, the owner extended this into a product-wide principle ([0086](0086-2026-10-12-automatic-release.md)). Reassigning a taken seat and publishing a draft that removes assigned seats also free seats automatically, with no confirmation.

## Consequences
- **Same-transaction cleanup:** deactivating, archiving a unit, archiving a floor, reassigning and publishing all unassign seats in the same transaction, with one audit event per seat. Their responses list the freed seats.
- **Import:** the people import doesn't deactivate anyone, so it never frees seats.
- **Floor archive:** the TODO in `locations/floors.py` (refuse when seats are assigned) is replaced by freeing the seats.
- **Live updates:** `seat.assignment_changed` ([0041](0041-2026-10-08-live-updates.md)) covers single, batch, import and cleanup changes alike.
- **Planned PRs** (stacked, [0079](0079-2026-10-08-stacked-pr-workflow.md)):
  1. assignment API plus the freeing rules
  2. search and occupancy
  3. the batch endpoint and the CSV/XLSX import
