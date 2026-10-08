# 0018 — Repository layout: monorepo

- **Date:** 2026-10-08
- **Status:** Accepted

## Options considered
- **Monorepo** ✅
- Separate repositories

## Decision
A single git repository:
```
/backend    FastAPI service (Python, uv)                — 0010, 0014
/frontend   React + react-three-fiber app (TypeScript) — 0011
/authz      OpenFGA model + model tests                — 0013
/deploy     Docker Compose (and later Helm) for on-prem — 0005
/docs       Decision records (this directory)
```

## Consequences
- An API change and its regenerated TypeScript client land in the same commit.
- One CI pipeline with path-based jobs: backend lint, type checks and tests; frontend build and tests; OpenFGA model tests; image builds.
- Releases are versioned together as a single HSP version, which keeps on-prem upgrades simple.
