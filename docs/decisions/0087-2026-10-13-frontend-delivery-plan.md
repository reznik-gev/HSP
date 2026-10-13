# 0087 — Frontend delivery plan: viewer first, English and Hebrew, desktop

- **Date:** 2026-10-13
- **Status:** Accepted
- **Refines:** [0011](0011-2026-10-08-frontend-stack.md), [0043](0043-2026-10-08-editor-view-layout.md), [0046](0046-2026-10-08-display-units.md), [0054](0054-2026-10-08-release-distribution.md), [0061](0061-2026-10-08-test-strategy.md), [0066](0066-2026-10-08-frontend-state-and-ui-components.md), [0067](0067-2026-10-08-frontend-package-manager-and-router.md)

## Note on how this was decided
> The product owner is new to frontend libraries ([0066](0066-2026-10-08-frontend-state-and-ui-components.md)). Choices 4, 7, 8, 9 and 10 are the assistant's recommendations, accepted as offered. Treat them as **lower-confidence** and revisit them freely once real screens exist. Choices 1, 2, 3, 5, 6, 11 and 12 are product decisions the owner made.

## Context
The backend covers everything v1 needs (decisions [0076](0076-2026-10-08-backend-delivery-plan.md)–[0086](0086-2026-10-12-automatic-release.md)). The editor's behavior ([0042](0042-2026-10-08-2d-renderer.md)–[0052](0052-2026-10-08-svg-commitment-and-performance-gate.md)) and the frontend libraries ([0066](0066-2026-10-08-frontend-state-and-ui-components.md), [0067](0067-2026-10-08-frontend-package-manager-and-router.md)) are already decided. Still open was how to build the frontend: the order, the audience, and the look.

## Decisions
| # | Question | Options | Chosen |
|---|---|---|---|
| 1 | Build order | **Viewer → admin → editor** / editor first / admin tables first | **Phase 1, viewer:**<ul><li>app shell and login</li><li>browsing sites › buildings › floors</li><li>a read-only floor plan</li><li>"where does X sit?"</li></ul>**Phase 2, admin:** people and org, imports, and assigning seats on the plan. **Phase 3:** the full editor. Each phase is usable and demoable, and the plan viewer is what the editor grows from. |
| 2 | Languages | English only / English now and translation-ready / **English and Hebrew in v1** | **English and Hebrew (right-to-left) in v1.** All UI text goes through translation files from the first screen. Layouts use direction-neutral CSS (Tailwind's `ms-`/`me-`/`ps-`/`pe-`/`start`/`end`, never left or right), and every screen is checked in both directions. |
| 3 | Devices | **Desktop only** / desktop editor with a phone viewer / everything on touch | **Desktop only:** a large screen with a mouse and keyboard. No mobile layouts or touch gestures in v1. |
| 4 | Visual style | **Clean and neutral, light and dark** / distinctive brand / light only | **A calm, professional look:** neutral greys, one accent color and clear type, in the style of tools like Linear or Notion. It follows the system's light or dark setting and can be overridden per user. It can be re-skinned later. |
| 5 | Choosing the language | **Browser default, switchable, saved per user** / saved in the browser / fixed per installation | **The first visit follows the browser's language.** A switcher in the user menu changes it, and the choice is **saved on the server** with the user's other preferences (theme, display units, [0046](0046-2026-10-08-display-units.md)), so it follows them to any computer. This adds a small preferences API. |
| 6 | The floor plan in Hebrew | **Never mirrored** / mirrored | **The drawing is geometry and never mirrors.** North stays up and east stays right in both languages. Only the panels and toolbars around it mirror. Labels on the plan are shown in their own text direction. |
| 7 | App layout | **Collapsible sidebar and top bar** / top navigation only | **A sidebar with the main areas:** Floors, People, Seats, Catalog, Imports and Admin. It sits on the right in Hebrew and collapses to icons to give the plan room. **A top bar holds:**<ul><li>the global "where does X sit?" search</li><li>the language and theme switchers</li><li>the user menu</li></ul> |
| 8 | Frontend tests | **Component tests plus a few browser tests** / component tests only / mostly browser tests | **Vitest with Testing Library** renders screens against a fake API and checks what the user sees, **in both languages**. **A few Playwright tests** drive a real browser against the dev stack for key flows: logging in, finding a seat, and later assigning one. |
| 9 | Translation library | **react-i18next** / Lingui / FormatJS | **react-i18next.** Text lives in one JSON file per language (`en.json`, `he.json`) that a translator can edit. Hebrew plural rules and number and date formatting come from the browser's built-in `Intl`. |
| 10 | Fonts | **Bundled Inter and Heebo** / system fonts / Rubik | **Inter** for Latin text and **Heebo** for Hebrew. Both are open-licensed, are **bundled with the app** (an offline install can't load Google Fonts, [0054](0054-2026-10-08-release-distribution.md)), and come to about 300 KB. |
| 11 | Seats on the read-only plan | **Click for details, and search highlights** / also color by unit / just the drawing | **Seats are colored by state**, with a legend: assigned, reserved for a unit, free, bookable, unavailable. Hovering shows a tooltip, and **clicking opens a side panel** with the label and holder. **A search result opens its floor**, then highlights and centers the seat. |
| 12 | Delivery | **Small stacked PRs** / one PR per phase | **Small stacked PRs**, each adding one step you can try in the browser, restacked with `scripts/restack.sh` ([0079](0079-2026-10-08-stacked-pr-workflow.md)). |

## Phase 1 PR sequence
1. **Shell:**
   - the sidebar and top bar
   - shadcn/ui setup and theme tokens for light and dark
   - the bundled fonts
   - react-i18next with English and Hebrew, switching `dir`
   - component-test setup
2. **Session:**
   - signing in through the existing BFF login ([0038](0038-2026-10-08-api-authentication.md))
   - showing the current user, and signing out
   - sending the CSRF header on writes
   - handling an expired session
3. **Preferences:**
   - a backend `GET/PUT /me/preferences` for language, theme and display units, stored per Keycloak subject
   - the switchers that save to it
4. **Browsing:** sites › buildings › floors, with the occupancy counts ([0085](0085-2026-10-12-seat-assignment-api.md)).
5. **Plan viewer:** the published plan through the existing SVG view, read-only, with seat colors, a legend, tooltips and the details panel.
6. **Search:** the global search, its results, and opening and highlighting a seat. This PR also adds the first Playwright flow.

Phases 2 and 3 get their own plan records once phase 1 is in use.

## Consequences
- **Translations:**
  - Every visible string needs an English and a Hebrew entry, and a test fails when a key is missing in either file.
  - The assistant writes the first Hebrew translations, and **the owner reviews them**.
- **RTL in code review:** physical left/right CSS classes are flagged, and screens are checked in both directions. The plan canvas is the one deliberate exception (choice 6).
- **Fonts:** Inter and Heebo files live in `frontend/src/assets/fonts` along with their licenses (SIL OFL).
- **Preferences** are new backend state: one small table keyed by the Keycloak subject.
- **No mobile layouts in v1.** Search could get a phone-friendly view later if people need it.
