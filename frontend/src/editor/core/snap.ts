/**
 * Basic snapping for phase 3a (docs/0089): wall endpoints first, so walls join exactly and
 * rooms close (docs/0044), then the grid (docs/0047). Phase 3b adds midpoints, centrelines,
 * wall faces and the rest of docs/0047.
 */
import type { Plan, Vec2 } from "./plan";

/** How close (in screen pixels) the pointer must be to snap to an endpoint. */
export const SNAP_PX = 8;

export type SnapKind = "endpoint" | "grid" | null;

export interface Snapped {
  point: Vec2;
  kind: SnapKind;
}

export function snapPoint(
  plan: Plan,
  p: Vec2,
  opts: {
    mmPerPx: number;
    gridMm: number;
    gridSnap: boolean;
    extra?: readonly Vec2[];
    /** A point never to snap to, e.g. the junction being dragged. */
    ignore?: Vec2;
  },
): Snapped {
  const reach = SNAP_PX * opts.mmPerPx;
  let best: Vec2 | null = null;
  let bestD = reach;
  const consider = (q: Vec2) => {
    if (opts.ignore && q[0] === opts.ignore[0] && q[1] === opts.ignore[1]) return;
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d <= bestD) {
      best = q;
      bestD = d;
    }
  };
  for (const w of plan.walls) {
    consider(w.a);
    consider(w.b);
  }
  for (const q of opts.extra ?? []) consider(q);
  if (best) return { point: best, kind: "endpoint" };
  if (opts.gridSnap) {
    const g = opts.gridMm;
    return { point: [Math.round(p[0] / g) * g, Math.round(p[1] / g) * g], kind: "grid" };
  }
  // Whole millimetres only (docs/0029).
  return { point: [Math.round(p[0]), Math.round(p[1])], kind: null };
}
