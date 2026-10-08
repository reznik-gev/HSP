# HSP frontend

React + TypeScript single-page app ([0011](../docs/decisions/0011-2026-10-08-frontend-stack.md),
[0066](../docs/decisions/0066-2026-10-08-frontend-state-and-ui-components.md),
[0067](../docs/decisions/0067-2026-10-08-frontend-package-manager-and-router.md)).

## Prerequisites

- Node.js 24 LTS and pnpm (the version is pinned in `package.json` → `packageManager`)
- The backend running on `:8000` and the dev stack (`../deploy/compose.dev.yml`) for Keycloak on `:8080`

## Common tasks

| Task                               | Command                                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Install                            | `pnpm install`                                                                                                                                 |
| Dev server (http://localhost:5173) | `pnpm dev`. It proxies `/api` and `/auth`, giving one origin like production ([0038](../docs/decisions/0038-2026-10-08-api-authentication.md)) |
| Regenerate API types               | `pnpm api:types` (after `backend/openapi.json` changes; commit the result)                                                                     |
| Lint / format / types              | `pnpm lint` · `pnpm format` · `pnpm typecheck`                                                                                                 |
| Tests                              | `pnpm test` (`pnpm test:watch` while developing)                                                                                               |
| Production build                   | `pnpm build`                                                                                                                                   |

## Layout

```
src/
  main.tsx            app bootstrap (TanStack Query + Router)
  routes.tsx          route tree
  api/                typed client (openapi-fetch) + generated schema.d.ts (docs/0039)
  editor/core/        HEADLESS editor core: tools, snapping, store, units (docs/0052)
  lib/utils.ts        cn() helper for Tailwind classes
  components/ui/      shadcn/ui components, added with `pnpm dlx shadcn@latest add <name>`
```

## Rules worth knowing

- **`src/editor/core` must not import React, DOM or view code.** ESLint enforces this. It's what lets the SVG view be swapped if the performance gate fails ([0052](../docs/decisions/0052-2026-10-08-svg-commitment-and-performance-gate.md)).
- Lengths are integer **mm** everywhere except on screen. Use `parseLength` and `formatLength` from `editor/core/units.ts` ([0046](../docs/decisions/0046-2026-10-08-display-units.md)).
- Server data lives in TanStack Query. Editor state lives in the Zustand store ([0066](../docs/decisions/0066-2026-10-08-frontend-state-and-ui-components.md)).

## SVG performance bench ([0052](../docs/decisions/0052-2026-10-08-svg-commitment-and-performance-gate.md), [0073](../docs/decisions/0073-2026-10-08-svg-performance-test-setup.md), [0074](../docs/decisions/0074-2026-10-08-svg-gate-results-and-v1-bounds.md))

- **Play with it:** run `pnpm dev`, then open http://localhost:5173/bench/svg. It shows a synthetic 1,500-seat floor with a live FPS overlay. Drag empty space or middle-drag to pan, use the wheel to zoom, click a desk to select it (its monitors come along), shift-click to add, and drag to move (5 cm grid). The side panel changes the seat count and toggles labels, hatching, door arcs, zone fills and level of detail. Add `?seats=3000` to the URL to try other sizes.
- **Measure:** `pnpm bench:svg` (add `-- --seats 3000` for other sizes) builds in `bench` mode, opens the installed Google Chrome, drives the page with real mouse input, and writes `bench/results/*.{json,md}`. Don't touch the mouse while it runs. The pass limits are the v1 values from 0074.
- The bench route exists only in the dev server and `vite build --mode bench`. Production builds don't contain it.

## Version pins

- **TypeScript is pinned to 5.x** (currently 5.9.3). TypeScript 7 (the native compiler) is out, but `typescript-eslint` (requires < 6.1) and `openapi-typescript` (requires 5.x) don't support it yet. Dependabot ignores TypeScript major updates. Lift the pin once both tools support TS 7.
