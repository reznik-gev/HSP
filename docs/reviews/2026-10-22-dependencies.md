# Dependencies review, October 2026

- **Date:** 2026-10-22
- **Code reviewed:** commit `3e3a3ec`, the top of the v1 stack (#99–#112)
- **Part of:** the [maintainability review](2026-10-22-maintainability.md). The owner asked for a deeper look at our dependencies.

## Summary

Our dependencies are **few, current and free of known vulnerabilities**. The weak spot is the automation around them. **Dependabot doesn't watch three of the five places that hold dependencies.** And nothing checks for vulnerabilities that have no fix yet, which [0059](../decisions/0059-2026-10-08-supply-chain-security.md) said to revisit "before the first customer installation", meaning 1.0.0.

| # | Recommendation | Size |
|---|---|---|
| 1 | Add the missing Dependabot entries: `backup/` (Python), and the Dockerfiles in `deploy/backup/`, `deploy/keycloak/` and `deploy/web/` | Small |
| 2 | Decide on vulnerability scanning before 1.0.0, as 0059 asks (for example `pip-audit`, `pnpm audit` and an image scanner such as Trivy, in CI) | Small to medium |
| 3 | Drop `uuid-utils`: Python 3.14 has `uuid.uuid7()` built in | Small |
| 4 | Record the dependency no decision names: openpyxl. (psutil, raised on #102, was removed instead: [0111](../decisions/0111-2026-10-23-cpu-and-memory-from-the-platform.md).) | Small |

## 1. How many we have

| Project | Direct (runtime) | Direct (dev only) | Locked in total, with everything they pull in |
|---|---|---|---|
| Backend (`backend/`) | 24 | 6 | 85 packages |
| Backup program (`backup/`) | 7 | 7 | 48 packages |
| Frontend (`frontend/`) | 18 | 24 | about 700 packages |
| Images | Python 3.14 slim, Node 24 slim, nginx-unprivileged 1.30, Keycloak 26.8, PostGIS 18-3.6 | | |

This is a small set for an app of this size. The frontend's 700 packages are mostly build and test tools (Vite, ESLint, Vitest, Playwright, TypeScript). The browser downloads only the 18 runtime packages, bundled.

**Most dependencies are used in only a few files.** That makes each one easy to replace:

| Dependency | Files that use it | What for |
|---|---|---|
| psutil | 1 (`metrics.py`) | Memory and CPU of the API's worker processes. Removed on #102 ([0111](../decisions/0111-2026-10-23-cpu-and-memory-from-the-platform.md)). |
| openpyxl | 1 (`imports.py`) | Reading Excel files on import |
| email-validator | 1 | Checking emails on import |
| cryptography | 1 (`auth/tokens.py`) | Encrypting stored tokens |
| Authlib, joserfc, httpx2 | 1–2 (`auth/oidc.py`, `readiness.py`) | Sign-in |
| Shapely | 2 (`plans/`) | Geometry checks |
| uuid-utils | 2 | UUIDv7 IDs |
| d3-hierarchy | 1 (org chart) | Laying out the tree |

The exceptions are the frameworks, which are used everywhere on purpose: FastAPI, SQLAlchemy and Pydantic in the backend, and React, TanStack Query, Zustand (24 files) and lucide icons (31 files) in the frontend.

## 2. How current they are

Measured with `uv pip list --outdated` and `pnpm outdated` on 2026-10-22:

- **Python:** 21 packages are behind, all minor or patch updates. The largest gap is FastAPI, 0.143 → 0.161. FastAPI is still before 1.0, so its minor versions can break things, and 18 of them have piled up. Dependabot PR #121 is open with 9 of these updates.
- **Backup program:** 7 behind, all patch updates except python-dateutil 2 → 3, which boto3 pulls in.
- **Frontend:** 18 behind, all patch or minor, except TypeScript 5 → 7. That one is pinned on purpose, until typescript-eslint and openapi-typescript support TypeScript 7 (see `frontend/README.md`). Dependabot PR #122 is open with 15 updates.
- **Known vulnerabilities:** none. `pnpm audit --prod` and `pip-audit` (on the backend) found nothing.

**Upkeep so far:** Dependabot opened 6 PRs in two weeks: 4 merged, and 2 (#121, #122) open. The weekly groups keep this to one PR per ecosystem per week. Each one so far has been merged the same day.

## 3. Gaps in the automation

### 3.1 Dependabot doesn't watch everything

[0059](../decisions/0059-2026-10-08-supply-chain-security.md) says Dependabot watches Python, npm, "Docker base images and pinned third-party images (Keycloak, PostGIS, nginx)" and GitHub Actions. `.github/dependabot.yml` covers less:

| Place | Watched? |
|---|---|
| `backend/` Python (`uv.lock`) | Yes |
| `frontend/` npm | Yes |
| `backend/Dockerfile` (Python base image) | Yes |
| `deploy/compose.dev.yml` (Keycloak, PostGIS for development) | Yes |
| GitHub Actions | Yes |
| **`backup/` Python (`uv.lock`)** | **No.** Added with #106, after the config was written. |
| **`deploy/backup/Dockerfile`, `deploy/keycloak/Dockerfile`, `deploy/web/Dockerfile`** | **No.** Dependabot looks only in the folders listed. |
| **`deploy/compose/compose.yml`** (the production stack's PostGIS) | **Probably not.** Dependabot's compose support reads the folder listed, `deploy/`, and this file is one level down. |

So the production Keycloak, nginx and PostGIS images could fall behind with no PR to tell us.

### 3.2 Images follow moving tags

The base images use tags like `python:3.14-slim` and `nginx-unprivileged:1.30`. These tags move: each build takes whatever the latest patch is. That gets security patches without anyone acting, but two builds of the same commit can differ, and Dependabot has nothing to bump. The alternative is to pin each image by digest and let Dependabot move the pins. Builds are then reproducible, but there are more PRs to review. Either is reasonable. Today it's a choice nobody recorded.

### 3.3 Nothing finds vulnerabilities that have no fix yet

[0059](../decisions/0059-2026-10-08-supply-chain-security.md) names this gap: Dependabot only acts when an update exists. A vulnerable package with no fix, or an image with a vulnerable system library, goes unnoticed. 0059 says to revisit this "before the first customer installation", and 1.0.0 will be that. Signing and the software bill of materials (SBOM) are already planned for 1.3/1.4 ([0104](../decisions/0104-2026-10-21-v1-release-scope-and-support.md)). Scanning isn't scheduled anywhere.

A cheap first step would be a CI job that runs `pip-audit` (backend and backup), `pnpm audit --prod`, and an image scanner such as Trivy on the built images. It would warn, not block, at first.

## 4. Smaller findings

- **`uuid-utils` is no longer needed.** Python 3.14 added `uuid.uuid7()` to the standard library (we checked: it works in our environment). The package is used in two places (`models/base.py`, and `main.py` for request IDs).
- **Two dependencies no decision names.** psutil and openpyxl. Every other runtime dependency is named in a decision record. These two are small and harmless, but [CLAUDE.md](../../CLAUDE.md) asks for technical choices to be recorded. *Update, 2026-10-23:* psutil was removed on [#102](https://github.com/reznik-gev/HSP/pull/102). The API's CPU and memory now come from the platform ([0111](../decisions/0111-2026-10-23-cpu-and-memory-from-the-platform.md)), so only openpyxl is left to record.
- **`tzdata` is never imported.** That is expected: it supplies time-zone data to `zoneinfo` on systems without it (slim images and Windows). A one-line comment in `pyproject.toml` would stop someone removing it.
- **httpx2** is a new successor of httpx that Authlib now prefers. It's young, but it's used in only two files.
