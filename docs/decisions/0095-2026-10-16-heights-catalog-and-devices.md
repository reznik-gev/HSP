# 0095 — Heights on the plan, Catalog and Devices screens (frontend phase 3c)

- **Date:** 2026-10-16
- **Status:** Accepted
- **Refines:** [0089](0089-2026-10-15-floor-editor.md) (its 3c step), [0021](0021-2026-10-08-object-catalog.md), [0022](0022-2026-10-08-device-asset-data.md), [0083](0083-2026-10-10-catalog-and-device-api.md), [0088](0088-2026-10-14-admin-screens.md)

## Context
Phases 3a and 3b of the editor are merged ([0089](0089-2026-10-15-floor-editor.md), [0092](0092-2026-10-15-editor-speed-tools.md)). 0089 planned 3c as the 3D view and a Catalog screen. [0094](0094-2026-10-16-3d-view-after-v1.md) moves the 3D view past v1 and shows heights on the 2D plan instead. The server already manages catalog items, zone types and devices ([0083](0083-2026-10-10-catalog-and-device-api.md)), but only the catalog had a screen planned.

The product owner chose the questions below; details marked *(assistant)* were decided by the assistant and are lower-confidence ([0088](0088-2026-10-14-admin-screens.md) pattern).

## Decisions
| # | Question | Chosen |
|---|---|---|
| 1 | Showing height | **Height cues on the 2D plan** ([0094](0094-2026-10-16-3d-view-after-v1.md)). |
| 2 | Which admin screens 3c adds | **Catalog (with zone types) and Devices**, closing every admin gap the API has. |
| 3 | When a placed custom item's size, shape or flags change | **Placements are never updated.** They keep their revision for good; only new placements use the new one. To change a placed item, delete it and place the new one. |

## Height cues
- An item is **raised** when its `z` isn't 0 (a wall-mounted screen, a shelf). Items attached to a host sit on it and are drawn as today.
- Raised items have a **dashed outline** and a tag with their height range, bottom to top: a 30 cm shelf at 1.8 m shows `1.80–2.10`.
- **Higher items are drawn on top** of lower ones, and both stay clickable.
- **Windows** get the same tag from sill to top (`0.90–2.10`); doors don't.
- Tags show at the zoom level where seat labels appear, and otherwise only on the selected item.
- A **height filter**, **All** (default) / **Floor** / **Raised**, next to the grid controls, fades the other group rather than hiding it.
- Heights are edited where they are today, in the properties panel; tags follow as you type.
- The cues show in the editor and on the read-only floor page.

## Catalog screen (admins)
- A new sidebar item. A list grouped by category, with search and a **Built-in / Custom / Archived** filter. Each row: a small top-down drawing, name, W × D × H, and badges for the flags (Seat, Mountable, Attaches to…, Takes floor space).
- **Built-in items** open read-only with **Make a copy**, which creates a custom item with the same values named "… (copy)".
- **Custom items**: a side panel edits name, category, shape (box, cylinder, L), size, colour and the four flags, with a live top-down preview at true proportions. The category is an existing one or a new one typed in.
- Before saving a change to size, shape or flags, the panel says: "Items already on floors keep their current size. Only new placements use this one." (decision 3).
- **Archive** hides an item from the editor's list; placed items keep working. It acts at once, with Undo ([0088](0088-2026-10-14-admin-screens.md)).
- **Zone types** are a second tab: name, colour and "enclosed room"; add, edit, and delete if never used (the server's `409 in-use` is explained).
- *(assistant)* Built-in categories have translated names; custom categories show as typed, with underscores as spaces.

## Devices screen (admins)
- A new sidebar item. Search by asset tag or serial number; filters **Placed / Not placed** and **Issued / Not issued**. Each row: asset tag, serial number, who it's issued to, and the floor it's placed on with **Show on plan**.
- A side panel edits asset tag, serial number, notes and the person it's issued to (the type-ahead person picker from the seat panel).
- **Delete** only for a device never placed; otherwise the server refuses and the screen says it's in a floor's history.
- Placing a device stays in the editor (the item's Device field); devices still also come in through imports.

## Phase 3c PR sequence (stacked GitHub stack, [0093](0093-2026-10-16-github-stacked-prs.md))
1. **Height cues**: raised items, height tags, drawing order, window tags, and the height filter, in the editor and on the floor page.
2. **Catalog list**: the sidebar item, list, filters, search and read-only built-in panel with Make a copy.
3. **Custom catalog items**: create, edit (with the revision notice), preview, and archive with Undo.
4. **Zone types** tab.
5. **Devices** screen: list, search, filters, Show on plan, and the panel.

## Consequences
- No new server endpoints: everything uses [0083](0083-2026-10-10-catalog-and-device-api.md)'s API.
- Old revisions of a custom item stay on floors until someone replaces those items by hand.
