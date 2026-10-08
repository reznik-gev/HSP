# 0053 — Code hosting & CI: GitHub + GitHub Actions

- **Date:** 2026-10-08
- **Status:** Accepted
- **Partially superseded by:** [0068](0068-2026-10-08-public-repository.md) (visibility); **refined by** [0070](0070-2026-10-08-ci-gate-job.md) (workflow structure)

## Options considered
- **GitHub + Actions** ✅
- GitLab (SaaS or self-hosted)
- Azure DevOps
- Forgejo/Gitea + Actions (self-hosted)

## Decision
- The monorepo ([0018](0018-2026-10-08-repository-layout.md)) is hosted in a **private GitHub repository**.
- CI/CD runs on **GitHub Actions**, using path-filtered workflows:

  | Workflow | Trigger | Jobs |
  |---|---|---|
  | `backend` | `backend/**`, `shared/**` | ruff, mypy, pytest (unit + DB integration, [0061](0061-2026-10-08-test-strategy.md)), OpenAPI export + staleness check |
  | `frontend` | `frontend/**`, `shared/**`, `backend/openapi.json` | eslint, prettier check, tsc, vitest, client-type staleness check ([0039](0039-2026-10-08-frontend-api-client.md)) |
  | `perf` | `frontend/**` (nightly + on demand) | SVG performance budget ([0042](0042-2026-10-08-2d-renderer.md), [0052](0052-2026-10-08-svg-commitment-and-performance-gate.md)) |
  | `backup-restore` | weekly | restore drill ([0058](0058-2026-10-08-backups.md)) |
  | `release` | tag `v*.*.*` | build images, assemble offline bundle ([0054](0054-2026-10-08-release-distribution.md)) |
- Required status checks protect `main` ([0064](0064-2026-10-08-branching-workflow.md)).

## Consequences
- The source code lives in GitHub's cloud. The *product* stays fully on-prem ([0005](0005-2026-10-07-deployment-model.md)).
- The performance benchmark needs stable hardware. GitHub-hosted runners are noisy, so its thresholds are trend-based there, or it moves to a self-hosted runner later.
- The release workflow attaches bundles to GitHub Releases internally. **How customers download bundles** (a portal, or direct handover) is still open.
