# 0084 — People, org units and the CSV/Excel import

- **Date:** 2026-10-10
- **Status:** Proposed. Chosen by Claude, using the recommended option for each question, while the product owner was away. **Pending owner review.**
- **Refines:** [0006](0006-2026-10-07-org-hierarchy-model.md), [0017](0017-2026-10-08-people-data-source.md), [0023](0023-2026-10-08-primary-unit-rule.md), [0027](0027-2026-10-08-v1-interim-people-and-access.md), [0078](0078-2026-10-08-archive-semantics.md)

## Decisions (recommended options, not yet confirmed)
| Question | Chosen | Why |
|---|---|---|
| Org tree shape | **One root per tenant.** Units can be moved (`parent_id`), and cycles are refused (`409 unit-cycle`). | [0006](0006-2026-10-07-org-hierarchy-model.md). The single root is already a database constraint. |
| Archiving a unit | **Blocked while it has active child units** (`409`). Members and seats held by the unit don't block it. | Same as locations ([0078](0078-2026-10-08-archive-semantics.md)). [0031](0031-2026-10-08-seat-assignment-rules.md) says the unit's seats are flagged for reallocation, not blocked. |
| Removing a person | **`DELETE` deactivates** (`active = false`), and `POST …/reactivate` undoes it | [0017](0017-2026-10-08-people-data-source.md): inactive, never deleted. History and assignments stay intact. |
| Email handling | **Stored lowercase, unique per tenant** | Login linking ([0027](0027-2026-10-08-v1-interim-people-and-access.md)) and import matching compare emails, so case must not matter. |
| Editing memberships | **`PUT /people/{id}/memberships` replaces the whole list atomically** | One request keeps "exactly one primary" consistent. There are no partial states. |
| Primary unit when none is marked | **The deepest unit** (ties go to the lowest unit id) | [0023](0023-2026-10-08-primary-unit-rule.md). An explicitly marked primary is kept as an override. |
| Positions | Belong to a unit. Deleting is blocked while memberships use the position (`409 in-use`). | Keeps memberships valid. |
| Import formats | **CSV (UTF-8, comma) and XLSX** (first sheet), with header names as listed below | [0027](0027-2026-10-08-v1-interim-people-and-access.md). Excel is what HR exports. |
| Import flow | **Dry run by default** (a report of created, updated, unchanged and errors per row), then the same upload with `?apply=true`. **All or nothing.** | Admins see exactly what will change before anything does. A bad row never leaves a half-imported organization. |
| Import matching | Units by `external_id` (required). People by `external_id`, or by email when it's empty. | [0027](0027-2026-10-08-v1-interim-people-and-access.md). Parents need a key to reference. |

## Import columns
**Units** (`POST /imports/units`): `external_id`*, `name`*, `parent_external_id`, `level_label`. Exactly one unit has no parent: the root, unless a root already exists.

**People** (`POST /imports/people`): `email`*, `display_name`*, `external_id`, `title`, `primary_unit_external_id`, `secondary_unit_external_ids` (separated by `;`), `position`, where the position title belongs to the primary unit and is created if missing.

\* required. Unknown columns are ignored and reported.

## Endpoints
`/org-units` (list as a flat page with `parent_id`, CRUD, `restore`), `/org-units/{id}/positions`, `/people` (search by `q` over name and email, filter by unit, CRUD, `reactivate`), `/people/{id}/memberships`, `/imports/units`, `/imports/people`.

Writes need hsp-admin and CSRF, and every write is audited. Each import is recorded as one audit event with its counts ([0033](0033-2026-10-08-audit-logging.md)).
