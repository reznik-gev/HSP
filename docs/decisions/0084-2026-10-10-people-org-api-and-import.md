# 0084 — People, org units and the CSV/Excel import

- **Date:** 2026-10-10
- **Status:** Accepted. Proposed by Claude while the product owner was away, then reviewed by the owner choice by choice on 2026-10-12. Eight choices were approved as proposed, and two (primary unit, positions) were changed.
- **Supersedes:** [0023](0023-2026-10-08-primary-unit-rule.md) (deepest unit wins)
- **Refines:** [0006](0006-2026-10-07-org-hierarchy-model.md), [0017](0017-2026-10-08-people-data-source.md), [0027](0027-2026-10-08-v1-interim-people-and-access.md), [0078](0078-2026-10-08-archive-semantics.md)
- **Amended by:** [0086](0086-2026-10-12-automatic-release.md) (unit archiving cascades and moves members up)

## Decisions
| Question | Chosen | Why |
|---|---|---|
| Org tree shape | **One root per tenant.** Units can be moved (`parent_id`), and cycles are refused (`409 unit-cycle`). | [0006](0006-2026-10-07-org-hierarchy-model.md). The single root is already a database constraint. |
| Archiving a unit | **Blocked while it has active child units** (`409`). Members and seats held by the unit don't block it. *Now: cascades to sub-units, members move up to the nearest active ancestor, and unit-held seats are freed ([0086](0086-2026-10-12-automatic-release.md), [0085](0085-2026-10-12-seat-assignment-api.md)).* | Same as locations ([0078](0078-2026-10-08-archive-semantics.md)). |
| Removing a person | **`DELETE` deactivates** (`active = false`), and `POST …/reactivate` undoes it | [0017](0017-2026-10-08-people-data-source.md): inactive, never deleted. History and assignments stay intact. |
| Email handling | **Stored lowercase, unique per tenant** | Login linking ([0027](0027-2026-10-08-v1-interim-people-and-access.md)) and import matching compare emails, so case must not matter. The owner considered case-sensitive emails and kept lowercase, because Keycloak lowercases emails and case-sensitive login linking would fail. |
| Editing memberships | **`PUT /people/{id}/memberships` replaces the whole list atomically** | One request keeps "exactly one primary" consistent. There are no partial states. |
| Primary unit when none is marked | **Must be marked explicitly** (owner's choice; Claude had proposed the deepest unit from 0023) | Someone in several units must have exactly one marked primary, or the request is refused with `422 primary_required`. A lone membership is primary by itself. In the import, rows with secondary units must name `primary_unit_external_id`. No guessing, so the primary unit always reflects a decision. |
| Positions | Belong to a unit. **Deleting is always allowed**: holders keep their unit membership without a position (owner's choice; Claude had proposed `409 in-use`). | Cleanup isn't held up by people still holding the position. The `position.deleted` audit event lists the former holders. |
| Import formats | **CSV (UTF-8, comma) and XLSX** (first sheet), with header names as listed below | [0027](0027-2026-10-08-v1-interim-people-and-access.md). Excel is what HR exports. |
| Import flow | **Dry run by default** (a report of created, updated, unchanged and errors per row), then the same upload with `?apply=true`. **All or nothing.** | Admins see exactly what will change before anything does. A bad row never leaves a half-imported organization. |
| Import matching | Units by `external_id` (required). People by `external_id`, or by email when it's empty. | [0027](0027-2026-10-08-v1-interim-people-and-access.md). Parents need a key to reference. |

## Import columns
**Units** (`POST /imports/units`): `external_id`*, `name`*, `parent_external_id`, `level_label`. Exactly one unit has no parent: the root, unless a root already exists.

**People** (`POST /imports/people`): `email`*, `display_name`*, `external_id`, `title`, `primary_unit_external_id`, `secondary_unit_external_ids` (separated by `;`, requires `primary_unit_external_id`), `position`, where the position title belongs to the primary unit and is created if missing.

\* required. Unknown columns are ignored and reported.

## Endpoints
`/org-units` (list as a flat page with `parent_id`, CRUD, `restore`), `/org-units/{id}/positions`, `/people` (search by `q` over name and email, filter by unit, CRUD, `reactivate`), `/people/{id}/memberships`, `/imports/units`, `/imports/people`.

Writes need hsp-admin and CSRF, and every write is audited. Each import is recorded as one audit event with its counts ([0033](0033-2026-10-08-audit-logging.md)).
