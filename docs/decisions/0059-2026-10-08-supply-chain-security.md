# 0059 — Supply-chain & security checks in CI: automated dependency updates

- **Date:** 2026-10-08
- **Status:** Accepted

## Options considered (multi-select)
- **Dependency updates** ✅
- Vulnerability scanning (Trivy) ❌ (not now)
- SBOM + image signing (CycloneDX, cosign) ❌ (not now)
- Static analysis (CodeQL / Semgrep) ❌ (not now)

## Decision
- **Dependabot** (native to GitHub, [0053](0053-2026-10-08-code-hosting-and-ci.md)) opens weekly grouped PRs for:
  - Python (`uv.lock`)
  - npm
  - Docker base images and pinned third-party images (Keycloak, PostGIS, nginx)
  - GitHub Actions versions
- Dependency PRs go through the normal required checks ([0064](0064-2026-10-08-branching-workflow.md)).
- Bundle integrity is limited to SHA-256 checksums ([0054](0054-2026-10-08-release-distribution.md)).

## Consequences and known gaps
- Nothing *detects* a known vulnerability in a dependency or image that has no update yet. Dependabot only reacts to available updates.
- Customers can't cryptographically verify bundle origin or get a software bill of materials (SBOM). Enterprise security reviews often ask for both.
- **Revisit triggers:** before the first customer installation, or when a customer's security questionnaire asks. The deferred items are additive CI jobs with no architectural impact.
