# 0039 — Frontend API client: openapi-typescript + openapi-fetch

- **Date:** 2026-10-08
- **Status:** Accepted
- **Builds on:** [0011](0011-2026-10-08-frontend-stack.md), [0035](0035-2026-10-08-api-style.md)

## Options considered
- **openapi-typescript + openapi-fetch** ✅
- Orval (generated TanStack Query hooks + mocks)
- Hey API (generated SDK + plugins)

## Decision
- `openapi-typescript` generates **types only** from `backend/openapi.json` into `frontend/src/api/schema.d.ts`.
- `openapi-fetch` provides a tiny typed client over `fetch`. It's configured once with `credentials: "same-origin"` and the CSRF header ([0038](0038-2026-10-08-api-authentication.md)).
- **TanStack Query** handles caching, refetching and polling ([0041](0041-2026-10-08-live-updates.md)). Query hooks are hand-written thin wrappers per feature.

## Consequences
- No generated runtime code to review or upgrade. Lock-in is low.
- CI regenerates the types and **fails if the committed schema or types are stale**, so backend and frontend contracts can't drift ([0018](0018-2026-10-08-repository-layout.md)).
- Request mocks for frontend tests are written by hand (for example MSW handlers typed against the schema).
