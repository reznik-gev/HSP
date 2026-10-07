# 0019 — Org-unit tree source: derived from AD groups

- **Date:** 2026-10-08
- **Status:** Accepted
- **Resolves:** open question in [0017](0017-2026-10-08-people-data-source.md)
- **Refines:** [0006](0006-2026-10-07-org-hierarchy-model.md)

## Options considered
- Maintained in HSM
- **Derived from AD groups** ✅
- Derived from AD attributes (department, manager chain)
- AD seeds the tree, HSM owns it afterwards

## Decision
- A designated set of **AD groups defines the org units**. They're identified by a configurable rule: a base DN/OU and/or a name prefix such as `HSM-Unit-*`.
- **Group nesting forms the unit tree.** Keycloak's LDAP group mapper imports the groups with their hierarchy preserved, and the HSM sync job ([0017](0017-2026-10-08-people-data-source.md)) mirrors them as units.
- **Group membership defines unit membership.** Each unit's AD group ID is stored as its immutable external ID.

## Rules for what AD alone can't express
| Concern | Rule |
|---|---|
| Structure (unit existence, parent, membership) | **AD is authoritative.** These fields are read-only in HSM. |
| Unit metadata (level label, display color, description) | Owned by HSM. |
| Positions in a unit ("Team Lead", …) | Owned by HSM. |
| Unit managers | Owned by HSM by default. Optionally derived from the AD group's `managedBy` attribute (configurable). |
| Space ownership and delegation | Owned by HSM ([0007](0007-2026-10-07-authorization-model.md)). |
| Person in several unit groups | One must be **primary**. See the open question below. |
| Group deleted in AD | The unit is **archived**, not deleted. Spaces it owned revert to the parent unit and are flagged for review. |
| Group moved to another parent | The unit moves. Effective permissions change, and the move is audited. A notification goes to affected space owners. |
| Cyclic or multi-parent nesting in AD | Rejected by the sync, which reports it in the admin console. The tree stays strict per 0006. |

## Consequences
- IT manages org structure in AD, and HSM follows automatically, so there's no duplicate maintenance.
- HSM depends on AD hygiene. A sync preview / dry-run report is needed before changes are applied, along with alerts for large structural changes (for example, more than N units moved in one sync).
- Membership changes produce OpenFGA tuple updates through the outbox ([0013](0013-2026-10-08-rebac-engine.md)).

## Open question
How the **primary unit** is chosen when a person is in multiple unit groups. Candidates: the deepest unit, an AD attribute (e.g. `extensionAttributeN`), or an HSM admin choice.
