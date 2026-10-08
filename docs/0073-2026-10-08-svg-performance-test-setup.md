# 0073 — SVG performance test setup

- **Date:** 2026-10-08
- **Status:** Accepted
- **Refines:** [0052](0052-2026-10-08-svg-commitment-and-performance-gate.md)

## Decisions
| Question | Options considered | Decision |
|---|---|---|
| Reference machine | **This machine** ✅ / this machine + 4× CPU throttling / a separate laptop | The development laptop: **Dell Latitude 5430, Intel i7-1265U (15 W, 10C/12T), Intel UHD integrated graphics, 16 GB RAM, 1920×1080 @ 60 Hz**. This genuinely matches 0052's "mid-range laptop with integrated graphics". The runner records whether it's on AC or battery. |
| Browsers | Playwright WebKit as Safari proxy / a Mac / **Chrome only for now** ✅ | **Chrome only** (the installed Google Chrome, via Playwright's `chrome` channel). |
| How to test | **Playground page + automated runner** ✅ / runner only / playground only | A dev-only **`/bench/svg`** page that you can pan, zoom, drag and click, with a live FPS and latency overlay and knobs. A **Playwright runner** (`pnpm bench:svg`) drives the same page with real mouse input and writes results to `frontend/bench/results/`. |
| What happens to the code | **Keep it as a dev-only route** ✅ / throwaway branch | Kept. The floor generator and SVG view live in the repo. The bench route is excluded from production builds, and only a special `bench` build mode includes it. The runner becomes the CI performance budget ([0042](0042-2026-10-08-2d-renderer.md)) and is reused for 0052's re-examination triggers. |

## Consequences
- **The gate is weaker than 0052 specified:** Safari (WebKit) is not measured. WebKit has historically differed most in SVG performance. **Revisit trigger:** a real Safari check (or Playwright WebKit as a proxy) **before 1.0**, or as soon as a customer with Mac users appears.
- Measurements use a **production build** (`vite build --mode bench`), not the dev server, because React's development mode is several times slower and would distort the numbers.
- The 60 Hz display caps the measurable frame rate at about 60 fps. That's enough to check the 50 fps and 45 fps thresholds.
- Results are recorded in a follow-up decision record (pass or fail, and if it fails, which fallback from 0052 applies).
