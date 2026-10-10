# 0080 — Floor-plan read access and diff format

- **Date:** 2026-10-10
- **Status:** Accepted
- **Refines:** [0015](0015-2026-10-08-floor-plan-versioning.md), [0027](0027-2026-10-08-v1-interim-people-and-access.md), [0036](0036-2026-10-08-floor-plan-io.md)

## Decisions
| Question | Options considered | Decision |
|---|---|---|
| Who may read which versions | **Published for all, drafts admins only** ✅ / everything for all / only current published for viewers | Every logged-in user can read the **published** version and all **superseded** (past) versions. **Drafts and discarded drafts are admin-only.** |
| Diff format | **Added / removed / changed with field diffs** ✅ / two full snapshots / ids only | Per element kind: `added` (full element as it is in *b*), `removed` (full element as it was in *a*), `changed` (element id plus **only the fields that differ**, with before and after values). |

## Details
- `GET /floors/{id}/versions` lists versions in the standard `{items, next_cursor}` envelope ([0040](0040-2026-10-08-pagination.md)), all in one page for now. Viewers see only published and superseded ones.
- `GET /floors/{id}/versions/{n}` returns the full plan of version *n* in the [0036](0036-2026-10-08-floor-plan-io.md) payload shape, with the catalog revisions it uses embedded. A version a viewer may not see returns **404**, so its existence isn't revealed.
- `GET /floors/{id}/draft` returns the current draft plan with its revision counter. Viewers get **403**, and admins get **404** when no draft exists.
- `GET /floors/{id}/versions/{a}/diff/{b}`: both versions must be readable by the caller. It works in either direction (*a* > *b* is allowed and shows the inverse).
- Elements are matched by their **stable element id** across versions ([0028](0028-2026-10-08-floor-version-storage.md)). A moved desk appears under `changed` (with its `position`), not as removed plus added.

## Consequences
- The "what changed" view and the publish review ([0015](0015-2026-10-08-floor-plan-versioning.md)) can be built directly on the diff, without client-side comparison.
- Viewers can browse layout history, for example "where did our team sit last quarter?", but never unfinished work.
