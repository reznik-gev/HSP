# 0017 — People data source: sync from AD/LDAP via Keycloak

- **Date:** 2026-10-08
- **Status:** Accepted
- **Builds on:** [0006](0006-2026-10-07-org-hierarchy-model.md), [0008](0008-2026-10-07-identity-provider.md)

## Options considered
- Managed in HSM + CSV import
- **Sync from AD/LDAP via Keycloak** ✅
- Sync from an HR system (HRIS) API
- HSM-managed now, sync later

## Decision
- Keycloak's **LDAP/AD user federation** is the upstream source for **people**: identity, name, email, department and title attributes, and enabled/disabled state.
- HSM runs a **sync job** that reads users (and optionally groups) from Keycloak's Admin API, plus incremental updates from Keycloak events. This means people exist in HSM **before** their first login, so seats can be assigned to them.
- Each HSM person stores an immutable **external ID** (the AD `objectGUID` exposed by Keycloak). Names and emails can change without breaking links.
- **Positions, secondary memberships and space ownership stay in HSM** and are never overwritten by the sync.

## Consequences
- A person disabled in AD is marked **inactive** in HSM, not deleted. Their seat assignments are flagged for reallocation.
- Synced fields are read-only in the HSM UI. HSM-owned fields are editable.
- **Open question (next decision):** whether the **org-unit tree** is also derived from AD (OUs, groups or the `manager`/`department` attributes) or maintained in HSM. That decision determines how much of [0006](0006-2026-10-07-org-hierarchy-model.md) is automated.
