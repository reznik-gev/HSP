# 0078 — Archive semantics for sites, buildings and floors

- **Date:** 2026-10-08
- **Status:** Accepted
- **Refines:** [0034](0034-2026-10-08-v1-data-model.md) (`archived_at` columns), [0035](0035-2026-10-08-api-style.md)

## Decisions
| Question | Options considered | Decision |
|---|---|---|
| What `DELETE` does | **DELETE archives + restore endpoint** ✅ / explicit archive, with DELETE hard-deleting unused items / hard delete only | **`DELETE /{resource}/{id}` archives** (sets `archived_at`) and **`POST /{resource}/{id}/restore`** undoes it. The API never hard-deletes. |
| Archiving a parent that has active children | **Block with 409** ✅ / cascade archive | **Refused with `409`** while active children exist (a site with active buildings, a building with active floors). The Problem Details response lists the blocking children ([0037](0037-2026-10-08-api-errors.md)). Admins archive bottom-up. |

## Details
- Lists hide archived items unless `?include_archived=true`. `GET /{id}` still returns an archived item, with `archived_at` set.
- Archived items are read-only: `PATCH` returns `409` until the item is restored.
- Archiving something already archived is a no-op (`204`), so retries are safe.
- Restoring a child under an archived parent is refused (`409`). Restore top-down.
- Every archive and restore is audited ([0033](0033-2026-10-08-audit-logging.md)).

## Consequences
- History, audit records, floor versions and seat assignments are never orphaned by the API.
- There's no way to remove a typo'd site completely through the API. If that becomes a real need, a separate admin-only purge can be added for never-used items.
