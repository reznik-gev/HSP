/**
 * Snapping for drawing and dragging (docs/0047, docs/0092 step 1). Within a few screen pixels,
 * in this order:
 *   1. wall endpoints (and the tool's own points, e.g. a room's first corner): walls join
 *      exactly and rooms close (docs/0044);
 *   2. wall midpoints;
 *   3. a wall's centreline: a wall drawn to it meets it in a T-junction (docs/0044);
 * otherwise the grid, when grid snap is on. Holding Alt turns all of it off.
 */
import { alongSegment } from "./geometry";
import type { Plan, Vec2 } from "./plan";

/** How close (in screen pixels) the pointer must be to snap to a wall. */
export const SNAP_PX = 8;

export type SnapKind = "endpoint" | "midpoint" | "centreline" | "grid" | null;

export interface Snapped {
  point: Vec2;
  kind: SnapKind;
}

export interface SnapOptions {
  mmPerPx: number;
  gridMm: number;
  gridSnap: boolean;
  /** Alt held: no snapping at all, just whole millimetres. */
  free?: boolean;
  /** More points to snap to, like endpoints (e.g. the corners placed so far). */
  extra?: readonly Vec2[];
  /** A point never to snap to, e.g. the junction being dragged. */
  ignore?: Vec2;
  /** Walls not to snap to, e.g. those being changed. */
  ignoreWalls?: ReadonlySet<string>;
}

const same = (p: Vec2, q: Vec2) => p[0] === q[0] && p[1] === q[1];

/** The nearest of `points` within `reach` of `p`. */
function nearest(points: Iterable<Vec2>, p: Vec2, reach: number, ignore?: Vec2): Vec2 | null {
  let best: Vec2 | null = null;
  let bestD = reach;
  for (const q of points) {
    if (ignore && same(q, ignore)) continue;
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d <= bestD) {
      best = q;
      bestD = d;
    }
  }
  return best;
}

export function snapPoint(plan: Plan, p: Vec2, opts: SnapOptions): Snapped {
  const round = (q: Vec2): Vec2 => [Math.round(q[0]), Math.round(q[1])];
  if (opts.free) return { point: round(p), kind: null };
  const reach = SNAP_PX * opts.mmPerPx;
  const walls = plan.walls.filter((w) => !opts.ignoreWalls?.has(w.id));

  const end = nearest(
    [...walls.flatMap((w) => [w.a, w.b]), ...(opts.extra ?? [])],
    p,
    reach,
    opts.ignore,
  );
  if (end) return { point: end, kind: "endpoint" };

  const mid = nearest(
    walls.map((w): Vec2 => round([(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2])),
    p,
    reach,
    opts.ignore,
  );
  if (mid) return { point: mid, kind: "midpoint" };

  let onWall: Vec2 | null = null;
  let onWallD = reach;
  for (const w of walls) {
    const { along, length } = alongSegment(p, w.a, w.b);
    if (length === 0 || along < 0 || along > length) continue;
    const q: Vec2 = [
      w.a[0] + ((w.b[0] - w.a[0]) / length) * along,
      w.a[1] + ((w.b[1] - w.a[1]) / length) * along,
    ];
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d <= onWallD) {
      onWall = q;
      onWallD = d;
    }
  }
  if (onWall) return { point: round(onWall), kind: "centreline" };

  if (opts.gridSnap) {
    const g = opts.gridMm;
    return { point: [Math.round(p[0] / g) * g, Math.round(p[1] / g) * g], kind: "grid" };
  }
  // Whole millimetres only (docs/0029).
  return { point: round(p), kind: null };
}

/** The store's snapping settings, for tools: zoom, grid and whether Alt is held. */
export function snapSettings(
  s: { viewport: { mmPerPx: number }; gridMm: number; gridSnap: boolean },
  free = false,
): SnapOptions {
  return { mmPerPx: s.viewport.mmPerPx, gridMm: s.gridMm, gridSnap: s.gridSnap, free };
}
