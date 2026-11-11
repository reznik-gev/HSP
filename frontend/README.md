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
| Tests                              | `pnpm test` (`pnpm test:watch` while developing); how to write them: [docs/guides/testing.md](../docs/guides/testing.md)                       |
| Test coverage                      | `pnpm test:coverage`; the report is `coverage/index.html` ([0114](../docs/decisions/0114-2026-10-23-test-coverage-report.md))                  |
| Production build                   | `pnpm build`                                                                                                                                   |
| Browser tests                      | `pnpm e2e`, against the running dev stack; add `PW_CHANNEL=msedge` to use Edge ([docs/guides/testing.md](../docs/guides/testing.md))           |

## Layout

Each feature has its own folder, with its pages, panels and a `data.ts` of queries and mutations through the typed `api` client. `devices/data.ts` is a good example to copy. Shared code sits in `api/`, `app/`, `auth/`, `components/`, `i18n/` and `lib/`.

```
src/
  main.tsx            app bootstrap (TanStack Query + Router)
  routes.tsx          route tree; a new page also gets a link in app/Sidebar.tsx
  index.css           Tailwind and the light and dark colour tokens

  Shared
  api/                typed client (openapi-fetch), generated schema.d.ts (docs/0039), Problem Details errors
  app/                the shell: sidebar, top bar and global search, user menu, release version
  auth/               the session, sign-in gate and admin checks (docs/0077)
  components/ui/      shadcn/ui components, added with `pnpm dlx shadcn@latest add <name>`
  i18n/               en.json and he.json, and right-to-left for Hebrew
  lib/                preferences, theme, notices with Undo (notify.tsx), the cn() helper

  Features
  floors/             sites, buildings and floors, and the read-only floor plan page
  editor/             the floor editor (docs/0089)
    core/             HEADLESS: plan model, store, undo, snapping, plan checks, interaction (docs/0052)
      tools/          one class per tool: select, wall, opening, column, zone, item, number
    view-svg/         the SVG plan, its overlay and zoom controls
    session/          the edit lock, autosave and the plan loaded for editing
    properties/, problems/, publish/
                      the side panels, and publishing and history
    tests/            screen tests of the editor, by task
  people/             people and their panel
  org/                the org chart, units and positions
  seats/              seat assignment and the free seats list
  devices/, catalog/  devices, and the furniture, device and zone-type catalog
  imports/            CSV and Excel imports
  bench/              the SVG performance bench page (dev only)
  test/               test helpers: renderApp, the stub backend, editor stubs
e2e/                  Playwright browser tests, the restore drill and the sizing bench
bench/                the script that drives the SVG bench
```

## Rules worth knowing

- **`src/editor/core` must not import React, DOM or view code.** ESLint enforces this. It's what lets the SVG view be swapped if the performance gate fails ([0052](../docs/decisions/0052-2026-10-08-svg-commitment-and-performance-gate.md)).
- Lengths are integer **mm** everywhere except on screen. Use `parseLength` and `formatLength` from `editor/core/units.ts` ([0046](../docs/decisions/0046-2026-10-08-display-units.md)).
- Server data lives in TanStack Query. Editor state lives in the Zustand store ([0066](../docs/decisions/0066-2026-10-08-frontend-state-and-ui-components.md)).
- Every text is in both `i18n/en.json` and `i18n/he.json`. A test fails if a key is missing from one, or empty.
- Use logical classes (`ms-`, `pe-`, `start-`, `text-start`), not left and right, so the layout mirrors in Hebrew. ESLint enforces it ([0087](../docs/decisions/0087-2026-10-13-frontend-delivery-plan.md)).
- `floors/` and `editor/` import each other: the editor takes its plan queries from `floors/planData.ts` and `useLockedByText` from `floors/EditFloorButton.tsx`. Keep new shared plan code out of both if you can ([maintainability review](../docs/reviews/2026-10-22-maintainability.md#12-frontend)).

## SVG performance bench ([0052](../docs/decisions/0052-2026-10-08-svg-commitment-and-performance-gate.md), [0073](../docs/decisions/0073-2026-10-08-svg-performance-test-setup.md), [0074](../docs/decisions/0074-2026-10-08-svg-gate-results-and-v1-bounds.md))

- **Play with it:** run `pnpm dev`, then open http://localhost:5173/bench/svg. It shows a synthetic 1,500-seat floor with a live FPS overlay. Drag empty space or middle-drag to pan, use the wheel to zoom, click a desk to select it (its monitors come along), shift-click to add, and drag to move (5 cm grid). The side panel changes the seat count and toggles labels, hatching, door arcs, zone fills and level of detail. Add `?seats=3000` to the URL to try other sizes.
- **Measure:** `pnpm bench:svg` (add `-- --seats 3000` for other sizes) builds in `bench` mode, opens the installed Google Chrome, drives the page with real mouse input, and writes `bench/results/*.{json,md}`. Don't touch the mouse while it runs. The pass limits are the v1 values from 0074.
- The bench route exists only in the dev server and `vite build --mode bench`. Production builds don't contain it.

## Version pins

- **TypeScript is pinned to 5.x** (currently 5.9.3). TypeScript 7 (the native compiler) is out, but `typescript-eslint` (requires < 6.1) and `openapi-typescript` (requires 5.x) don't support it yet. Dependabot ignores TypeScript major updates. Lift the pin once both tools support TS 7.
