# 0074 — SVG gate results; lowered performance bounds for v1

- **Date:** 2026-10-08
- **Status:** Accepted (temporary; revisit before 1.0)
- **Refines:** [0052](0052-2026-10-08-svg-commitment-and-performance-gate.md), [0073](0073-2026-10-08-svg-performance-test-setup.md)

## Results
The first run of the performance gate (`pnpm bench:svg`, raw data in [`frontend/bench/results/2026-10-08-svg-1500seats-gvr.md`](../../frontend/bench/results/2026-10-08-svg-1500seats-gvr.md)):

- **Machine:** Dell Latitude 5430, i7-1265U, Intel UHD, on AC power. Chrome 154, viewport 1600×900.
- **Floor:** 1,500 seats, 6,000 objects, 264 zones, 14 doors, 31 walls, **7,861 SVG nodes**. All labels, hatching, door arcs and zone fills were on, and level of detail was off (0052's worst case).

| Check | Measured | 0052 target | Met? |
|---|---|---|---|
| Drag 1 object (overview / working zoom) | 51.9 / 51.4 fps | ≥ 50 | ✅ (barely) |
| Drag 20 objects (overview / working zoom) | 52.8 / 59.1 fps | ≥ 50 | ✅ |
| Pan (overview / working zoom) | **43.5** / 51.7 fps | ≥ 45 | ❌ / ✅ |
| Wheel zoom (overview / working zoom) | **41.1 / 39.7** fps | ≥ 45 | ❌ |
| Initial render (median of 3) | 158 ms | ≤ 1,500 ms | ✅ |
| Click → selection painted (median) | 35.3 ms (max 66.8) | ≤ 50 ms | ✅ |

The run used the plain SVG view with **none** of the pan/zoom mitigations from [0042](0042-2026-10-08-2d-renderer.md).

## Decision
The misses are small (at most about 12% below target), and the editor is **usable** at this level. The product owner decided **not** to spend more effort on performance for v1:

1. **SVG stays** as the 2D renderer. The 0052 fallbacks (hybrid canvas or Konva) are **not** triggered.
2. The gate's pass limits are **lowered for v1**. They live in the `LIMITS` constant in `frontend/bench/run-svg-bench.ts`:

   | Check | v1 limit | 0052 target (kept as the 1.0 goal) |
   |---|---|---|
   | Drag 1 or 20 objects | **≥ 45 fps** | ≥ 50 fps |
   | Pan and wheel zoom | **≥ 35 fps** | ≥ 45 fps |
   | Initial render | ≤ 1,500 ms | unchanged |
   | Click → selection painted (median) | ≤ 50 ms | unchanged |

   The limits sit about 10–15% below the measured values, so normal run-to-run noise doesn't make the gate flaky.
3. The editor work that 0052 was gating can now begin.

## Known improvements, deliberately deferred
These are recorded so they aren't rediscovered later:
- **Pan/zoom by composited CSS transform** (an 0042 mitigation): during a gesture, transform the already-rendered SVG, then commit the `viewBox` after the gesture ends (≤ 150 ms). This targets exactly the failing checks. A prototype was started and then dropped by this decision.
- **Bench page bug:** the live overlay refreshes every 250 ms with a new callback identity, which re-renders the whole static plan layer. This slightly penalizes **every** measurement above. Fixing it (passing callbacks through stable wrappers) is the cheapest first step when performance is revisited.
- **Level of detail** (hide labels and monitors when zoomed out). It's already implemented and can be toggled on `/bench/svg`, but it's off in the worst-case gate.

## Consequences
- v1 may feel slightly less smooth when panning or zooming a very large floor (1,500+ seats) fully zoomed out on integrated graphics. Typical floors are smaller, and working zoom levels already meet the original targets except for wheel zoom.
- **Revisit triggers:** before 1.0 (restore the 0052 targets, applying the deferred improvements first), any of 0052's re-examination triggers (heatmaps, live seat status, multi-floor views, > 1,500 seats), or user complaints about smoothness.
- Safari/WebKit remains unmeasured ([0073](0073-2026-10-08-svg-performance-test-setup.md)).
