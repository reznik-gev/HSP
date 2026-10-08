# HSP frontend

React + TypeScript single-page app ([0011](../docs/0011-2026-10-08-frontend-stack.md),
[0066](../docs/0066-2026-10-08-frontend-state-and-ui-components.md),
[0067](../docs/0067-2026-10-08-frontend-package-manager-and-router.md)).

## Prerequisites

- Node.js 24 LTS and pnpm (the version is pinned in `package.json` → `packageManager`)
- The backend running on `:8000` and the dev stack (`../deploy/compose.dev.yml`) for Keycloak on `:8080`

## Common tasks

| Task                               | Command                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Install                            | `pnpm install`                                                                                                                       |
| Dev server (http://localhost:5173) | `pnpm dev`. It proxies `/api` and `/auth`, giving one origin like production ([0038](../docs/0038-2026-10-08-api-authentication.md)) |
| Regenerate API types               | `pnpm api:types` (after `backend/openapi.json` changes; commit the result)                                                           |
| Lint / format / types              | `pnpm lint` · `pnpm format` · `pnpm typecheck`                                                                                       |
| Tests                              | `pnpm test` (`pnpm test:watch` while developing)                                                                                     |
| Production build                   | `pnpm build`                                                                                                                         |

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

- **`src/editor/core` must not import React, DOM or view code.** ESLint enforces this. It's what lets the SVG view be swapped if the performance gate fails ([0052](../docs/0052-2026-10-08-svg-commitment-and-performance-gate.md)).
- Lengths are integer **mm** everywhere except on screen. Use `parseLength` and `formatLength` from `editor/core/units.ts` ([0046](../docs/0046-2026-10-08-display-units.md)).
- Server data lives in TanStack Query. Editor state lives in the Zustand store ([0066](../docs/0066-2026-10-08-frontend-state-and-ui-components.md)).

## Version pins

- **TypeScript is pinned to 5.x** (currently 5.9.3). TypeScript 7 (the native compiler) is out, but `typescript-eslint` (requires < 6.1) and `openapi-typescript` (requires 5.x) don't support it yet. Dependabot ignores TypeScript major updates. Lift the pin once both tools support TS 7.
