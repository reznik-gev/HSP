# 0028 — Floor version storage: version-range revision rows

- **Date:** 2026-10-08
- **Status:** Accepted
- **Implements:** [0015](0015-2026-10-08-floor-plan-versioning.md)

## Options considered
| Option | Notes |
|---|---|
| **Version-range rows** ✅ | Stable entity + revision rows valid for `[from_version, to_version)`. Unchanged objects are never copied. |
| Full snapshot per version | Simplest queries, but storage grows with floor size × number of publishes. |
| JSONB document per version | Easy diffs, but loses relational integrity and PostGIS queries. |

## Decision
- Every floor element (wall, opening, column, zone, placed object) has a **stable entity row** (`floor_element`) and one or more **revision rows** in a per-kind table, each carrying `from_version` (inclusive) and `to_version` (exclusive, `NULL` = open-ended).
- A revision is **visible in version _v_** iff `from_version <= v AND (to_version IS NULL OR v < to_version)`.
- `floor.published_version` points at the live version. The draft, if any, is `published_version + 1`.

### Operations
| Operation | Effect |
|---|---|
| Edit element in draft *D* | Close the current open revision (`to_version = D`) and insert a new revision with `from_version = D`. If the open revision already started at *D* (it was edited earlier in this draft), update it in place. |
| Add element in draft | Insert entity + revision with `from_version = D`. |
| Delete element in draft | Close its open revision with `to_version = D`. |
| **Publish** | `floor.published_version = D`. No rows are copied. |
| **Discard draft** | Delete revisions with `from_version = D`, then reopen revisions with `to_version = D`. |
| Restore old version *k* into a draft | Diff *k* against the published version and apply the result as draft edits. |

## Consequences
- An exclusion constraint (`btree_gist`) on `(element_id, int4range(from_version, to_version))` guarantees there are never two revisions of one element valid in the same version.
- "Published state" queries filter on the published version number. A partial GiST index on open-ended revisions (`to_version IS NULL`) speeds up draft and live spatial queries.
- A diff between versions *a* and *b* is a set-difference query over revision IDs.
- Version numbers are per floor and only ever increase.
