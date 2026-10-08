# 0076 — Backend delivery plan: login first, then the floor API, in small PRs

- **Date:** 2026-10-08
- **Status:** Accepted

## Context
The next backend work is the floor API (sites, buildings, floors, plan load/save with changesets: [0035](0035-2026-10-08-api-style.md), [0036](0036-2026-10-08-floor-plan-io.md)) and the backend-for-frontend login ([0038](0038-2026-10-08-api-authentication.md)). Edit locks, publishing and audit records all need to know **who** acted.

## Decisions
| Question | Options considered | Decision |
|---|---|---|
| Order, and how to identify users before login exists | Dev-only fixed principal / **login first** ✅ / trusted header | **Build login first.** Every floor endpoint is authenticated from the start, so there is no throwaway auth code. |
| PR slicing | 3 PRs / one big PR / **many small PRs** ✅ | **Many small PRs**, one per resource or endpoint group. Each must pass CI on its own. Stacked PRs are merged in order. |
| Server-side plan validation in this phase | **DB-level + core invariants** ✅ / full invariant set / DB constraints only | DB constraints, plus core structural rules: references exist, an opening fits its wall, z ≠ 0 only for mountable items, rotation range, and at publish seat-label uniqueness and single device placement. Zone overlap/nesting and clearance warnings come with the editor and the shared validation-case suite ([0051](0051-2026-10-08-validation-feedback.md)). |
| UI in this phase | Minimal admin pages / **backend-only** ✅ | **Backend-only.** The API is explored through Swagger UI at `/docs`. No new frontend pages. |

## Planned PR sequence
1. Auth foundations: settings, token encryption, session store, principal and role dependencies, CSRF check ([0077](0077-2026-10-08-login-implementation.md)).
2. OIDC login, callback, logout, `/auth/me` and token refresh ([0077](0077-2026-10-08-login-implementation.md)).
3. Sites, buildings and floors CRUD, with audit events and cursor pagination ([0033](0033-2026-10-08-audit-logging.md), [0040](0040-2026-10-08-pagination.md)).
4. Floor plan read path: versions, full-plan GET, diff.
5. Edit lock ([0016](0016-2026-10-08-edit-concurrency.md)).
6. Drafts and changesets ([0036](0036-2026-10-08-floor-plan-io.md)).
7. Publish, discard and restore ([0015](0015-2026-10-08-floor-plan-versioning.md)).

## Consequences
- Visible progress in the app arrives later. Until the editor is wired up, the backend is exercised through Swagger UI and tests.
- Small stacked PRs need care with merge order under rebase-only merging ([0069](0069-2026-10-08-rebase-merges.md)). After a lower PR merges, the next one is rebased onto `main`.
