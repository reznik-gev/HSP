# 0006 — Org hierarchy: tree of units + multi-role memberships

- **Date:** 2026-10-07
- **Status:** Accepted

## Context
People must be placed in custom-defined positions in the organization's hierarchy, and sub-organizations need their own permissions.

## Options considered
- **Tree + multi-role** ✅: strict unit tree, one primary unit per person, plus extra memberships and roles elsewhere.
- Strict tree: simplest, but can't express matrix or cross-functional membership.
- Full graph/matrix: most flexible, but permission semantics become ambiguous.

## Decision
- **Org units** form a single strict tree per tenant. Level names are configurable (for example Division / Department / Team).
- **Positions** are defined per unit (for example "Team Lead", "Engineer"). A position can be vacant or filled.
- Each **person** has exactly one **primary** membership (unit + position) and any number of **secondary** memberships (for example a project unit or a committee).
- Reporting lines follow the primary tree by default.

## Consequences
- Org-chart visualization stays a clean tree. Secondary memberships are shown as badges or links.
- Permissions can be granted to a unit (inherited by its subtree), to a membership role in a unit, or to an individual (see [0007](0007-2026-10-07-authorization-model.md)).
- Moving a unit in the tree is a first-class operation with an audit trail, because it changes effective permissions.
