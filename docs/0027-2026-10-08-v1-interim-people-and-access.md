# 0027 — v1 interim: people import, admin-only editing, Keycloak login

- **Date:** 2026-10-08
- **Status:** Accepted
- **Resolves:** open question in [0025](0025-2026-10-08-v1-scope.md)

## Context
v1 includes seat assignment but defers AD sync and OpenFGA. People must still exist, and access must still be controlled.

## Decisions

### 1. People and units: CSV/Excel import + UI
*Alternatives: a people-only sync pulled into v1; lazy creation on first login.*
- Admins import **people** and **units** (with parent references) from CSV/XLSX, and can create or edit them in the UI.
- The import format includes an optional **`external_id`** column (AD `objectGUID` for people, group GUID for units).
- Re-imports are idempotent upserts keyed on `external_id`, or on email for people without one.
- **Upgrade path:** when AD sync ([0017](0017-2026-10-08-people-data-source.md), [0019](0019-2026-10-08-org-unit-source.md)) ships, records are matched on `external_id`. Matched records become sync-owned and read-only. Unmatched records are reported for an admin to link or archive.

### 2. Access: admin-only editing
*Alternatives: global roles via Keycloak; OpenFGA with a minimal model.*
- **Admins** (Keycloak realm role `hsp-admin`) can do everything: edit and publish floors, manage the catalog, import people, assign seats.
- **All other authenticated users** have read-only access: browse floors in 2D/3D and search "where does X sit?".
- All checks still go through the single **authorization interface** from [0007](0007-2026-10-07-authorization-model.md) (e.g. `authz.check(user, "can_edit", space)`). The v1 implementation answers from the admin role, and OpenFGA replaces it later without touching callers.

### 3. Login: Keycloak in v1
*Alternative: local accounts in v1.*
- Keycloak ships in v1 per [0008](0008-2026-10-07-identity-provider.md). Customers can use Keycloak local users or plain LDAP login federation from day one. Only the **HSP-side** sync is deferred.
- A logged-in user is linked to their imported person record by `external_id` (if Keycloak exposes the LDAP GUID) or by email.

## Consequences
- v1 deployment: HSP API, frontend, PostgreSQL/PostGIS, Keycloak. **No OpenFGA in v1.**
- The edit lock ([0016](0016-2026-10-08-edit-concurrency.md)) "force release" in v1 is available to admins only.
- With only admins editing, the edit lock rarely contends in v1. It still prevents two admins from overwriting each other.
