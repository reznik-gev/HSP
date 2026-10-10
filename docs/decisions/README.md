# HSP Decision Log

HSP (Human-Space Program) design decisions, one document per decision. Part of the [HSP documentation](../README.md).

**Naming:** `NNNN-YYYY-MM-DD-short-slug.md` — a sequential number plus the date the decision was made.
**Status values:** `Proposed` · `Accepted` · `Superseded by NNNN` · `Deprecated`.
A decision is never edited after it is accepted. To change it, add a new document that supersedes it and update the old one's status line.
Exception: **pure renames** (no change to any decision) may be applied in place, recorded in their own document (see [0072](0072-2026-10-08-rename-hsm-to-hsp.md)).

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
| 0024 | 2026-10-08 | [Unit managers: assigned in HSP only](0024-2026-10-08-unit-managers.md)   | Accepted |
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
| 0052 | 2026-10-08 | [SVG commitment: renderer-agnostic core + performance gate](0052-2026-10-08-svg-commitment-and-performance-gate.md) | Accepted (v1 bounds lowered by 0074) |
| 0053 | 2026-10-08 | [Code hosting & CI: GitHub + Actions](0053-2026-10-08-code-hosting-and-ci.md) | Accepted (partially superseded by 0068; refined by 0070) |
| 0054 | 2026-10-08 | [Release distribution: offline bundle only](0054-2026-10-08-release-distribution.md) | Accepted |
| 0055 | 2026-10-08 | [Deployment target: Docker Compose, single host](0055-2026-10-08-deployment-target.md) | Accepted |
| 0056 | 2026-10-08 | [Upgrades: maintenance window + migrate job](0056-2026-10-08-upgrades-and-migrations.md) | Accepted |
| 0057 | 2026-10-08 | [Observability: standard outputs + optional stack](0057-2026-10-08-observability.md) | Accepted |
| 0058 | 2026-10-08 | [Backups: built-in scheduled dumps](0058-2026-10-08-backups.md)           | Accepted |
| 0059 | 2026-10-08 | [Supply chain: automated dependency updates](0059-2026-10-08-supply-chain-security.md) | Accepted |
| 0060 | 2026-10-08 | [Reverse proxy & TLS: Nginx](0060-2026-10-08-reverse-proxy.md)            | Accepted |
| 0061 | 2026-10-08 | [Tests: mostly mocked DB + targeted DB integration](0061-2026-10-08-test-strategy.md) | Accepted |
| 0062 | 2026-10-08 | [Tooling: Ruff + mypy, ESLint + Prettier](0062-2026-10-08-code-quality-tooling.md) | Accepted |
| 0063 | 2026-10-08 | [Release versioning: SemVer](0063-2026-10-08-release-versioning.md)       | Accepted |
| 0064 | 2026-10-08 | [Branching: trunk-based with PRs](0064-2026-10-08-branching-workflow.md)  | Accepted (merge method superseded by 0069) |
| 0065 | 2026-10-08 | [Python 3.13 & dev tooling (uv, Node LTS, pnpm)](0065-2026-10-08-python-version-and-dev-tooling.md) | Accepted |
| 0066 | 2026-10-08 | [Frontend state & UI: Zustand + shadcn/ui](0066-2026-10-08-frontend-state-and-ui-components.md) | Accepted (lower confidence) |
| 0067 | 2026-10-08 | [Frontend: pnpm + Vite + TanStack Router](0067-2026-10-08-frontend-package-manager-and-router.md) | Accepted |
| 0068 | 2026-10-08 | [Repository visibility: public](0068-2026-10-08-public-repository.md)       | Accepted |
| 0069 | 2026-10-08 | [Merge method: rebase only, linear history](0069-2026-10-08-rebase-merges.md) | Accepted |
| 0070 | 2026-10-08 | [CI structure: single workflow with gate job](0070-2026-10-08-ci-gate-job.md) | Accepted |
| 0071 | 2026-10-08 | [License: proprietary (source-visible); no external contributions](0071-2026-10-08-license-and-contributions.md) | Accepted |
| 0072 | 2026-10-08 | [Rename the product from HSM to HSP (Human-Space Program)](0072-2026-10-08-rename-hsm-to-hsp.md) | Accepted |
| 0073 | 2026-10-08 | [SVG performance test setup](0073-2026-10-08-svg-performance-test-setup.md) | Accepted |
| 0074 | 2026-10-08 | [SVG gate results; lowered performance bounds for v1](0074-2026-10-08-svg-gate-results-and-v1-bounds.md) | Accepted (temporary) |
| 0075 | 2026-10-08 | [Documentation structure: decisions move to docs/decisions/](0075-2026-10-08-docs-directory-structure.md) | Accepted |
| 0076 | 2026-10-08 | [Backend delivery plan: login first, then the floor API, in small PRs](0076-2026-10-08-backend-delivery-plan.md) | Accepted |
| 0077 | 2026-10-08 | [Login implementation: Authlib, encrypted sessions, Keycloak-driven lifetime](0077-2026-10-08-login-implementation.md) | Accepted |
| 0078 | 2026-10-08 | [Archive semantics: DELETE archives, restore endpoint, block on active children](0078-2026-10-08-archive-semantics.md) | Accepted |
| 0079 | 2026-10-08 | [Stacked PR workflow: parent-based PRs, auto-retarget, restack script](0079-2026-10-08-stacked-pr-workflow.md) | Accepted |
| 0080 | 2026-10-10 | [Floor-plan read access and diff format](0080-2026-10-10-plan-read-access-and-diff.md) | Accepted |
| 0081 | 2026-10-10 | [Drafts and changesets: numbering, auto-create, rules](0081-2026-10-10-drafts-and-changesets.md) | Accepted |
| 0082 | 2026-10-10 | [Publish, discard and restore](0082-2026-10-10-publish-discard-restore.md) | Proposed (owner review pending) |
| 0083 | 2026-10-10 | [Catalog, zone type and device API](0083-2026-10-10-catalog-and-device-api.md) | Proposed (owner review pending) |
