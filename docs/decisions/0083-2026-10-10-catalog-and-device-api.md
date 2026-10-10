# 0083 — Catalog, zone type and device API

- **Date:** 2026-10-10
- **Status:** Proposed. Chosen by Claude, using the recommended option for each question, while the product owner was away. **Pending owner review.**
- **Refines:** [0020](0020-2026-10-08-space-hierarchy.md), [0021](0021-2026-10-08-object-catalog.md), [0022](0022-2026-10-08-device-asset-data.md), [0034](0034-2026-10-08-v1-data-model.md)

## Decisions (recommended options, not yet confirmed)
| Question | Chosen | Why |
|---|---|---|
| Can built-in catalog items be edited? | **No, read-only** (`409 builtin-read-only`) | They're seeded and updated by migrations ([0034](0034-2026-10-08-v1-data-model.md) review E). Admins copy one into a custom item instead. |
| Editing a custom item's shape, dimensions or flags | **Creates a new revision** | [0021](0021-2026-10-08-object-catalog.md): existing placements keep their revision, so plans never change under people's feet. Name changes edit the item itself. |
| What `DELETE` does for catalog items | **Archives** (hidden from the picker, existing placements unaffected) | Matches [0078](0078-2026-10-08-archive-semantics.md). Placements in old versions keep working. |
| Can the `model` shape (uploaded 3D files) be created? | **No, not in v1** | [0021](0021-2026-10-08-object-catalog.md): no uploads in v1. Allowed values are `box`, `cylinder` and `l_shape`. |
| Category format | **Lowercase slug** (`^[a-z][a-z0-9_]*$`) | `attaches_to_categories` refers to categories by name, so they must be stable identifiers. |
| Deleting a zone type or device | **Only if never used** (`409 in-use` otherwise) | Neither table has `archived_at`, and both are referenced from floor-plan history. |
| Device lookup | **`GET /devices?q=` searches asset tag and serial; each device shows its current placement** (floor and element in published versions) | [0022](0022-2026-10-08-device-asset-data.md): "where is monitor MON-0412?" |

## Endpoints
| Endpoint | Notes |
|---|---|
| `GET/POST /zone-types`, `PATCH/DELETE /zone-types/{id}` | Names are unique per tenant |
| `GET /catalog-items?category=&include_archived=` | Built-in and tenant items, each with its current (latest) revision |
| `POST /catalog-items` | A custom item, created with revision 1 |
| `GET/PATCH/DELETE /catalog-items/{id}`, `GET /catalog-items/{id}/revisions` | `PATCH` with shape, dimension or flag fields adds a revision. `DELETE` archives. |
| `GET/POST /devices`, `GET/PATCH/DELETE /devices/{id}` | Asset tags are unique per tenant ([0022](0022-2026-10-08-device-asset-data.md)) |

Writes need hsp-admin and CSRF. Reads are open to any logged-in user ([0027](0027-2026-10-08-v1-interim-people-and-access.md)). Every write is audited ([0033](0033-2026-10-08-audit-logging.md)).
