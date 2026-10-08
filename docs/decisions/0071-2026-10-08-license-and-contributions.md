# 0071 — License: proprietary (source-visible); external contributions not accepted

- **Date:** 2026-10-08
- **Status:** Accepted
- **Follows from:** [0068](0068-2026-10-08-public-repository.md) (the public repository had no license)

## Context
The repository is public ([0068](0068-2026-10-08-public-repository.md)) but had no license file. Legally that already meant "all rights reserved", but only implicitly. HSP is an on-prem product ([0005](0005-2026-10-07-deployment-model.md)) that may be sold or licensed commercially.

## Options considered
| Option | Others may… |
|---|---|
| **Proprietary, source-visible** ✅ | Read the code (and fork it on GitHub, per GitHub's Terms of Service). Nothing else without written permission. |
| Source-available, delayed open (FSL-1.1 / BSL) | Use and self-host internally, but not compete commercially. Each release converts to Apache-2.0 after 2 years. |
| AGPL-3.0 | Use, modify and sell, but must publish changes, including for network use. Dual licensing is possible. |
| Apache-2.0 / MIT | Do almost anything, including closed commercial derivatives. |

**Contributions:**
- **Not accepted for now** ✅
- Accepted under DCO
- Accepted under a CLA

## Decision
- `LICENSE` at the repo root states **"All rights reserved"**. The only rights granted are those GitHub's Terms of Service require for public repositories (viewing and forking on GitHub). It includes a warranty disclaimer and notes that third-party components keep their own licenses.
- Package metadata declares the license as proprietary: `backend/pyproject.toml` has `license = "LicenseRef-Proprietary"`, and `frontend/package.json` has `"license": "UNLICENSED"` (npm's convention for "not licensed for use").
- `CONTRIBUTING.md` states that **external pull requests are not accepted**. Issues, security reports ([SECURITY.md](../../SECURITY.md)) and licensing inquiries are welcome.

## Consequences
- Every commercial option stays open: selling on-prem licenses, or later moving to FSL, AGPL with dual licensing, or permissive. A later change is easy because **all copyright stays with one holder**, which is why external contributions are closed.
- HSP is **not open source**. Expect few outside users or contributors, and code-search visibility without reuse.
- **Third-party obligations still apply** when distributing the offline bundle ([0054](0054-2026-10-08-release-distribution.md)). It must ship the notices and licenses of bundled components (for example Keycloak and nginx images, and Python and npm packages). A third-party notices file belongs in the release workflow. This is also an argument for revisiting SBOM generation ([0059](0059-2026-10-08-supply-chain-security.md)).
- The LICENSE text was drafted without legal review. **Have it reviewed by a lawyer before the first commercial distribution.** The copyright holder is currently written as the GitHub account name and should become the legal name or company.
