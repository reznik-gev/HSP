# 0108 — What we do with the first client demo's feedback

- **Date:** 2026-10-21
- **Status:** Accepted
- **Refines:** [0047](0047-2026-10-08-snapping.md) (snapping), [0044](0044-2026-10-08-wall-joins.md) (moving joined walls), [0104](0104-2026-10-21-v1-release-scope-and-support.md) (what comes after 1.0.0)

## Context
The owner showed HSP to a prospective client on 2026-10-21. The [notes from that meeting](../demos/feedback-2026-10-21.md) list six points. The owner went through them one by one, and added one more about walls: shortening a wall moved its joined end, not its free end.

## Decision
The owner decided each point:

| # | Point | Decision | Release |
|---|---|---|---|
| 1 | Wall snapping isn't always exact | Walls snap straight, and can be moved | 1.0.0 |
| 2 | Moving an item by 1 cm | Arrow keys nudge the selection | 1.0.0 |
| 3 | AD/LDAP sync | People and teams synced from the directory, **before Kubernetes** | 1.1 |
| 4 | Finding free seats | A highlight on the plan, and a list of free seats | 1.0.0 |
| 5 | Dark mode isn't clear enough | Rework its colours | 1.0.0 |
| 6 | Network ports and power outlets | As scoped in the notes | after 1.1 |

### 1. Straight walls, and moving them
The owner said walls came out "not straight", and couldn't easily be dragged or moved. Today a wall is exactly straight only when both its ends land on the grid. Dragging a wall's body pans the view; only a selected wall's ends can be dragged.
- **Straight:** while drawing a wall or dragging a wall's end, the end snaps onto the exact horizontal, vertical or 45° line through the wall's other end. It does this when it's within about 8 screen pixels of that line, like the other snaps, with a marker saying "Horizontal", "Vertical" or "45°". `Shift` forces the nearest 45° step. `Alt` still turns all snapping off.
- **Moving:** dragging a selected wall's body moves the whole wall, snapping as a drawn wall does. Walls joined to it stretch to stay joined, and `Alt` detaches it, as dragging a corner already works ([0044](0044-2026-10-08-wall-joins.md)). Its doors and windows move with it.
- **Shortening:** when exactly one end of a wall is joined to other walls, changing its **Length** in Properties moves the **free** end, so the corner stays where it is. Otherwise, as today, the end it was drawn to moves, and walls joined there follow. Claude proposed this, and the owner approved it.

### 2. Nudging with the arrow keys
- **Arrow keys** move the selection by **1 cm**; **`Shift`+arrow** by **10 cm**, a fixed step rather than the grid size, so it's predictable.
- **What moves:** everything that can be dragged: furniture, columns, devices, walls (with their joins, as in point 1) and zones. Doors and windows slide along their wall.
- **Undo:** a run of presses on the same selection undoes as **one step**, and is saved as one change. A pause of about a second, or any other action, ends the run.
- Arrows do nothing while typing in a field.

### 3. AD/LDAP sync in 1.1, before Kubernetes
- The client called it a must, and it may decide whether they buy. Kubernetes support moves to **1.2** (refining 0104, which said 1.1 or 1.2). The remote-management CLI goes with it.
- Before designing it, we ask the client, through the owner, what they need: people only, or teams too (groups or OUs), and how often to sync. Nightly may be enough.
- The design starts from [0017](0017-2026-10-08-people-data-source.md), [0019](0019-2026-10-08-org-unit-source.md) and [0027](0027-2026-10-08-v1-interim-people-and-access.md): imported people already carry the `external_id` a sync takes over.

### 4. Free seats, in 1.0.0
- **"Show free seats"** on the floor plan: a toggle that dims everything but the free seats. No blinking: it's tiring, and hard for some people to use.
- **A Free seats list**, filtered by site, building, floor, zone, and bookable or not. Each row has **Show on plan**.
- **Suggestions for a person without a seat**, near their team, come after 1.0.0. They need rules for what "near the team" means.

### 5. Dark mode, reworked for 1.0.0
Claude screenshots every screen in dark mode and lists what's unclear: contrast, seat colours, zone fills, labels and borders. Then the dark colour tokens in `frontend/src/index.css` are reworked in one place, checked for WCAG AA contrast. The owner approves before and after screenshots.

### 6. Network ports and power outlets, after 1.1
- **The line from the notes:** each port's and outlet's location, its number of sockets, and a network tag, plus a plan check such as "this desk has a PC but no port within reach". It leaves out switches, patch panels, cabling, IP addresses, live port status, and anything that talks to network equipment.
- **Before designing it**, ask the client whether it decides their purchase. Then settle whether tags are free text or a list per site, and whether a port belongs to a wall or to the floor.

## Consequences
- 1.0.0 waits for points 1, 2, 4 and 5, as well as the v1 stack (#99–#112).
- 1.1 is about AD sync, and 1.2 about Kubernetes.
- Points 1 and 2 add undoable edits. They go through the same changesets as dragging does ([0081](0081-2026-10-10-drafts-and-changesets.md)), so the server needs no change for them. Point 4's list may need a filter for free seats in `GET /seats`.
