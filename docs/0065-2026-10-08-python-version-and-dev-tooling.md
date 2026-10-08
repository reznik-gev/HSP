# 0065 — Python version & developer tooling

- **Date:** 2026-10-08
- **Status:** Accepted

## Options considered
**Python:**
- **3.13** ✅
- 3.12 (matches the interpreter installed locally)
- 3.14

**Local tooling** (missing on the developer machine):
- **Install via winget** ✅
- Write files only
- Run the tools in Docker

## Decision
- The backend targets **Python 3.13** (`requires-python = ">=3.13,<3.14"`). `uv` manages the interpreter itself, so the system Python 3.12 is irrelevant.
- Developer machines use:
  - **uv** for Python environments, dependencies and lockfiles
  - **Node.js LTS** (24.x)
  - **pnpm**

  On Windows these are installed with `winget` and `npm i -g pnpm`.
- Backend container images use the official `python:3.13-slim` base with uv in a multi-stage build ([0010](0010-2026-10-08-backend-stack.md)).

## Consequences
- `uv.lock` and `pnpm-lock.yaml` are committed, and CI installs from them in frozen mode.
- Moving to 3.14 is a later, explicit decision once all native wheels (asyncpg, Shapely, GEOS) are confirmed.
