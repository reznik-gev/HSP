# 0007 — Authorization: relationship-based access control (Zanzibar-style)

- **Date:** 2026-10-07
- **Status:** Accepted

## Context
Sub-organizations must be able to own and manage sub-spaces. Permissions therefore depend on two hierarchies at once: the **org tree** (who) and the **space tree** (where).

## Options considered
| Option | Notes |
|---|---|
| **ReBAC (OpenFGA / SpiceDB)** ✅ | Permissions are derived from relationships ("unit X owns floor 3", "floor 3 contains room 301") and inherit along both trees. A natural fit for delegated ownership. Adds one self-hostable service. |
| Hierarchical RBAC in-app | Fewer moving parts, but harder to extend. |
| RBAC + ABAC (OPA/Cedar) | Most expressive, but more complex to author and test. |

## Decision
Use a **Zanzibar-style ReBAC engine**. The specific engine (OpenFGA or SpiceDB) is chosen in the software-stack decision.

## Initial model sketch
```
type user
type org_unit
  relations: parent, member, manager
  manager inherits from parent.manager
type space            # site, building, floor, room, zone, seat
  relations: parent, owner_unit, editor, viewer
  can_edit  = editor or owner_unit.manager or parent.can_edit
  can_view  = viewer or can_edit or owner_unit.member or parent.can_view
  can_book  = can_view and bookable
```
- Ownership of a space is assigned to an **org unit**, and that unit's managers can edit it and everything inside it.
- A space owner can **delegate** a sub-space to a child unit (or any unit), which then manages it independently.

## Consequences
- The ReBAC service is part of the on-prem deployment ([0005](0005-2026-10-07-deployment-model.md)).
- The application database stays the source of truth. Relationship tuples are kept in sync through a transactional outbox, so they can always be rebuilt.
- Authorization checks go through one internal interface, so the engine can be swapped.
