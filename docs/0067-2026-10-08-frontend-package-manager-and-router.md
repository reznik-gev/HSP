# 0067 — Frontend package manager & router: pnpm + TanStack Router

- **Date:** 2026-10-08
- **Status:** Accepted
- **Resolves:** a deferred item in [0011](0011-2026-10-08-frontend-stack.md)

## Options considered
- **pnpm + TanStack Router** ✅
- npm + React Router
- pnpm + React Router

## Decision
- **pnpm** manages frontend dependencies. Its strict `node_modules` layout prevents importing undeclared ("phantom") dependencies.
- **Vite** is the dev server and bundler, which is standard for React + TypeScript.
- **TanStack Router** provides type-safe routes, path params and search params (e.g. `/floors/$floorId?mode=split`). It's used in code-based route configuration, and file-based routing can be adopted later.

## Consequences
- The router and the data layer come from the same family as TanStack Query ([0039](0039-2026-10-08-frontend-api-client.md)), with built-in integration (route loaders can prefetch queries).
- Contributors need pnpm installed. The version is pinned through the `packageManager` field in `package.json`.
