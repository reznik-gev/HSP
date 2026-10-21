/**
 * Snapping for drawing and dragging (docs/0047, docs/0092 step 1). Within a few screen pixels,
 * in this order:
 *   1. wall endpoints (and the tool's own points, e.g. a room's first corner): walls join
 *      exactly and rooms close (docs/0044);
 *   2. wall midpoints;
 *   3. a wall's centreline: a wall drawn to it meets it in a T-junction (docs/0044);
 * otherwise the grid, when grid snap is on. Holding Alt turns all of it off.
 *
 * A wall's end also snaps straight (docs/0108): onto the horizontal, vertical or 45° line
 * through its other end (`anchors`), before a wall's centreline (where the two cross) and the
 * grid (along the line). With Shift (`straight`), it always takes the nearest such line.
 */
import { alongSegment } from "./geometry";
import type { Plan, Vec2 } from "./plan";

/** How close (in screen pixels) the pointer must be to snap to a wall. */
export const SNAP_PX = 8;

export type SnapKind =
  "endpoint" | "midpoint" | "centreline" | "horizontal" | "vertical" | "diagonal" | "grid" | null;

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
  /** The other ends of the walls whose end this is: it snaps straight from them (docs/0108). */
  anchors?: readonly Vec2[];
  /** Shift held: keep to the nearest straight line from an anchor, however far off. */
  straight?: boolean;
}

/** A straight line through an anchor: horizontal, vertical, or 45° either way. */
interface Line {
  anchor: Vec2;
  /** The line's direction, (1,0), (0,1), (1,1) or (1,-1). */
  dir: Vec2;
  kind: "horizontal" | "vertical" | "diagonal";
}

const DIRECTIONS: readonly Pick<Line, "dir" | "kind">[] = [
  { dir: [1, 0], kind: "horizontal" },
  { dir: [0, 1], kind: "vertical" },
  { dir: [1, 1], kind: "diagonal" },
  { dir: [1, -1], kind: "diagonal" },
];

/** How far `p` is from `line`. */
function offLine(line: Line, p: Vec2): number {
  const [dx, dy] = [p[0] - line.anchor[0], p[1] - line.anchor[1]];
  return Math.abs(dx * line.dir[1] - dy * line.dir[0]) / Math.hypot(...line.dir);
}

/** The straight line from any anchor nearest to `p`: within `reach`, or any with `force`. */
function straightLine(anchors: readonly Vec2[], p: Vec2, reach: number, force: boolean) {
  let best: Line | null = null;
  let bestD = force ? Infinity : reach;
  for (const anchor of anchors) {
    if (same(anchor, p)) continue;
    for (const d of DIRECTIONS) {
      const line = { anchor, ...d };
      const off = offLine(line, p);
      if (off <= bestD) {
        best = line;
        bestD = off;
      }
    }
  }
  return best;
}

/** The point of `line` nearest `p`, with its free coordinate on the grid (or a whole mm), so a
 *  horizontal or vertical wall stays exactly so, and a 45° one exactly 45°. */
function onLine(line: Line, p: Vec2, step: number): Vec2 {
  const [ax, ay] = line.anchor;
  const snap = (v: number) => Math.round(v / step) * step;
  if (line.kind === "horizontal") return [snap(p[0]), ay];
  if (line.kind === "vertical") return [ax, snap(p[1])];
  // Along the diagonal: the x step, and the same y step with the line's sign.
  const t = snap((p[0] - ax + line.dir[1] * (p[1] - ay)) / 2);
  return [ax + t, ay + line.dir[1] * t];
}

/** Where `line` crosses the segment a→b, if it does. */
function crossing(line: Line, a: Vec2, b: Vec2): Vec2 | null {
  const [ex, ey] = [b[0] - a[0], b[1] - a[1]];
  const [dx, dy] = line.dir;
  const denom = ex * dy - ey * dx;
  if (denom === 0) return null; // parallel
  const s = ((line.anchor[0] - a[0]) * dy - (line.anchor[1] - a[1]) * dx) / denom;
  if (s < 0 || s > 1) return null;
  return [a[0] + ex * s, a[1] + ey * s];
}

/** A point on `line`, rounded to whole millimetres without leaving it. */
function roundOnLine(line: Line, q: Vec2): Vec2 {
  return onLine(line, q, 1);
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

  const line = opts.anchors?.length
    ? straightLine(opts.anchors, p, reach, Boolean(opts.straight))
    : null;
  // With Shift, a wall end or midpoint counts only if it lies on the forced line.
  const allowed = (q: Vec2) => !opts.straight || (line !== null && offLine(line, q) < 0.5);

  const end = nearest(
    [...walls.flatMap((w) => [w.a, w.b]), ...(opts.extra ?? [])].filter(allowed),
    p,
    reach,
    opts.ignore,
  );
  if (end) return { point: end, kind: "endpoint" };

  const mid = nearest(
    walls.map((w): Vec2 => round([(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2])).filter(allowed),
    p,
    reach,
    opts.ignore,
  );
  if (mid) return { point: mid, kind: "midpoint" };

  let onWall: Vec2 | null = null;
  let onWallD = reach;
  let onWallSeg: [Vec2, Vec2] | null = null;
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
      onWallSeg = [w.a, w.b];
    }
  }
  if (line) {
    // Straight up to a wall: where the line crosses it, if that's near the pointer.
    const x = onWallSeg && crossing(line, ...onWallSeg);
    if (x && Math.hypot(x[0] - p[0], x[1] - p[1]) <= reach) {
      return { point: roundOnLine(line, x), kind: "centreline" };
    }
    return { point: onLine(line, p, opts.gridSnap ? opts.gridMm : 1), kind: line.kind };
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
