# 0008 — Identity: bundled Keycloak (OIDC)

- **Date:** 2026-10-07
- **Status:** Accepted

## Context
HSP is self-hosted ([0005](0005-2026-10-07-deployment-model.md)) and must fit into customers' existing identity setups (Active Directory, Entra ID, etc.).

## Options considered
- **Bundled Keycloak (OIDC)** ✅: ships with HSP and federates to AD/LDAP, Entra ID, Google or local accounts.
- Direct LDAP/AD bind: simple, but couples HSP to LDAP.
- Any external OIDC/SAML: no IdP shipped, but the customer must already have one.
- Local accounts only: MVP-only.

## Decision
Ship **Keycloak** as part of the deployment. HSP itself only speaks **OIDC**.

## Consequences
- HSP has no password handling. Login, MFA and federation are all configured in Keycloak.
- One Keycloak realm per tenant (a single realm in v1), in line with [0003](0003-2026-10-07-tenancy-model.md).
- Users authenticate through Keycloak, but **org structure and memberships live in HSP** ([0006](0006-2026-10-07-org-hierarchy-model.md)). Optional sync of groups/attributes from AD is a later decision.
- Customers that already run an IdP can point HSP at it directly, because it's standard OIDC.
