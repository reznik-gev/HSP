# HSM Decision Log

HSM (Human-Space Management) design decisions, one document per decision.

**Naming:** `NNNN-YYYY-MM-DD-short-slug.md` — a sequential number plus the date the decision was made.
**Status values:** `Proposed` · `Accepted` · `Superseded by NNNN` · `Deprecated`.
A decision is never edited after it is accepted. To change it, add a new document that supersedes it and update the old one's status line.

| #    | Date       | Decision                                                                 | Status   |
|------|------------|--------------------------------------------------------------------------|----------|
| 0001 | 2026-10-07 | [Project charter & initial requirements](0001-2026-10-07-project-charter.md) | Accepted |
| 0002 | 2026-10-07 | [Build approach: from scratch](0002-2026-10-07-build-approach.md)         | Accepted |
| 0003 | 2026-10-07 | [Tenancy: single org, SaaS-ready](0003-2026-10-07-tenancy-model.md)       | Accepted |
| 0004 | 2026-10-07 | [Space authoring: 2D plan → extruded 3D](0004-2026-10-07-space-authoring-model.md) | Accepted |
| 0005 | 2026-10-07 | [Deployment: on-premise / self-hosted](0005-2026-10-07-deployment-model.md) | Accepted |
| 0006 | 2026-10-07 | [Org hierarchy: tree + multi-role](0006-2026-10-07-org-hierarchy-model.md) | Accepted |
| 0007 | 2026-10-07 | [Authorization: ReBAC (Zanzibar-style)](0007-2026-10-07-authorization-model.md) | Accepted |
| 0008 | 2026-10-07 | [Identity: bundled Keycloak (OIDC)](0008-2026-10-07-identity-provider.md) | Accepted |
| 0009 | 2026-10-07 | [Seating: fixed + bookable seats](0009-2026-10-07-seat-assignment-model.md) | Accepted |
| 0010 | 2026-10-08 | [Backend: Python + FastAPI (no Django)](0010-2026-10-08-backend-stack.md) | Accepted |
| 0011 | 2026-10-08 | [Frontend: React + react-three-fiber](0011-2026-10-08-frontend-stack.md) | Accepted |
| 0012 | 2026-10-08 | [Database: PostgreSQL + PostGIS](0012-2026-10-08-database.md)              | Accepted |
| 0013 | 2026-10-08 | [ReBAC engine: OpenFGA](0013-2026-10-08-rebac-engine.md)                  | Accepted |
| 0014 | 2026-10-08 | [Persistence: SQLAlchemy 2 + Alembic](0014-2026-10-08-persistence-layer.md) | Accepted |
| 0015 | 2026-10-08 | [Floor-plan versioning: draft → publish](0015-2026-10-08-floor-plan-versioning.md) | Accepted |
| 0016 | 2026-10-08 | [Edit concurrency: exclusive lock per floor](0016-2026-10-08-edit-concurrency.md) | Accepted |
| 0017 | 2026-10-08 | [People data: sync from AD/LDAP via Keycloak](0017-2026-10-08-people-data-source.md) | Accepted |
| 0018 | 2026-10-08 | [Repository layout: monorepo](0018-2026-10-08-repository-layout.md)       | Accepted |
| 0019 | 2026-10-08 | [Org-unit tree: derived from AD groups](0019-2026-10-08-org-unit-source.md) | Accepted |
| 0020 | 2026-10-08 | [Space hierarchy: fixed core + nestable zones](0020-2026-10-08-space-hierarchy.md) | Accepted |
| 0021 | 2026-10-08 | [Catalog: built-in + parametric items](0021-2026-10-08-object-catalog.md) | Accepted |
| 0022 | 2026-10-08 | [Device assets: light asset fields](0022-2026-10-08-device-asset-data.md)  | Accepted |
| 0023 | 2026-10-08 | [Primary unit: deepest unit wins](0023-2026-10-08-primary-unit-rule.md)   | Accepted |
| 0024 | 2026-10-08 | [Unit managers: assigned in HSM only](0024-2026-10-08-unit-managers.md)   | Accepted |
| 0025 | 2026-10-08 | [v1 scope: space modeling + seat assignment](0025-2026-10-08-v1-scope.md) | Accepted |
| 0026 | 2026-10-08 | [Line endings: normalize to LF](0026-2026-10-08-line-endings.md)          | Accepted |
| 0027 | 2026-10-08 | [v1 interim: CSV import, admin-only editing, Keycloak login](0027-2026-10-08-v1-interim-people-and-access.md) | Accepted |
| 0028 | 2026-10-08 | [Floor version storage: version-range rows](0028-2026-10-08-floor-version-storage.md) | Accepted |
| 0029 | 2026-10-08 | [Geometry: PostGIS on mm grid, yaw in 0.1°](0029-2026-10-08-geometry-representation.md) | Accepted |
| 0030 | 2026-10-08 | [Primary keys: UUIDv7](0030-2026-10-08-primary-keys.md)                    | Accepted |
| 0031 | 2026-10-08 | [Seat assignment: current-only, person or unit](0031-2026-10-08-seat-assignment-rules.md) | Accepted |
| 0032 | 2026-10-08 | [Architecture: walls, doors/windows, columns](0032-2026-10-08-architectural-elements.md) | Accepted |
| 0033 | 2026-10-08 | [Audit: app-level audit table](0033-2026-10-08-audit-logging.md)          | Accepted |
| 0034 | 2026-10-08 | [v1 data model (baseline)](0034-2026-10-08-v1-data-model.md)              | Accepted |
| 0035 | 2026-10-08 | [API style: REST + OpenAPI under /api/v1](0035-2026-10-08-api-style.md)   | Accepted |
| 0036 | 2026-10-08 | [Floor-plan I/O: load whole, save changesets](0036-2026-10-08-floor-plan-io.md) | Accepted |
| 0037 | 2026-10-08 | [API errors: RFC 9457 Problem Details](0037-2026-10-08-api-errors.md)     | Accepted |
| 0038 | 2026-10-08 | [API auth: BFF with HttpOnly session cookies](0038-2026-10-08-api-authentication.md) | Accepted |
| 0039 | 2026-10-08 | [Frontend client: openapi-typescript + openapi-fetch](0039-2026-10-08-frontend-api-client.md) | Accepted |
| 0040 | 2026-10-08 | [Pagination: cursor-based](0040-2026-10-08-pagination.md)                 | Accepted |
| 0041 | 2026-10-08 | [Live updates in v1: polling](0041-2026-10-08-live-updates.md)            | Accepted |
| 0042 | 2026-10-08 | [2D renderer: SVG](0042-2026-10-08-2d-renderer.md)                        | Accepted |
| 0043 | 2026-10-08 | [Editor layout: 2D main, 3D toggle/split](0043-2026-10-08-editor-view-layout.md) | Accepted |
| 0044 | 2026-10-08 | [Wall joins: linked endpoints](0044-2026-10-08-wall-joins.md)             | Accepted |
| 0045 | 2026-10-08 | [Dimension entry: inline typing + properties panel](0045-2026-10-08-dimension-entry.md) | Accepted |
| 0046 | 2026-10-08 | [Display units: cm default, per-user](0046-2026-10-08-display-units.md)   | Accepted |
| 0047 | 2026-10-08 | [Snapping: grid + object/wall](0047-2026-10-08-snapping.md)               | Accepted |
| 0048 | 2026-10-08 | [Plan underlay: not in v1](0048-2026-10-08-no-plan-underlay.md)           | Accepted |
| 0049 | 2026-10-08 | [Bulk tools: array, auto-numbering, cross-floor paste](0049-2026-10-08-bulk-layout-tools.md) | Accepted |
| 0050 | 2026-10-08 | [Undo/redo: per editing session](0050-2026-10-08-undo-redo.md)            | Accepted |
| 0051 | 2026-10-08 | [Validation: instant client preview, server authoritative](0051-2026-10-08-validation-feedback.md) | Accepted |
