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
