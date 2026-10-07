# 0002 — Build approach: from scratch

- **Date:** 2026-10-07
- **Status:** Accepted

## Context
HSM could be built as a plugin on an existing CRM/HRIS, on top of embedded draw.io, or as a standalone application.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| **From scratch** ✅ | Full control over cm-precise geometry, the hierarchy/permission model and UX. No vendor ceilings or licensing. | Most up-front effort: we build auth integration, the data model and the editor ourselves. |
| Plugin over CRM/HRIS (Salesforce, Dynamics, Odoo) | Users, org structure and permissions come with the platform. | The 3D editor would run in an embedded iframe. We'd inherit platform limits, licensing and release cycles. |
| Embedded draw.io | Fast start with a familiar UI. | It's a 2D vector diagram tool, so 3D and cm-precise spatial queries would be bolted on. Likely a dead end. |
| Hybrid core + adapters | Flexible long-term. | More architecture up front. |

## Decision
Build HSM as a **standalone application from scratch**.

## Consequences
- We own the domain model, editor and APIs end to end.
- We still design the API first, so HRIS/CRM connectors (for example, syncing people from an HR system) can be added later without restructuring. This keeps the "hybrid" option open.
- Identity is delegated to a standard IdP rather than built in-house (see [0008](0008-2026-10-07-identity-provider.md)).
