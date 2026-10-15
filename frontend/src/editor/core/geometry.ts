/** Pure 2D geometry helpers in plan millimetres. */
import type { Vec2 } from "./plan";

export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const ddegToRad = (ddeg: number): number => (ddeg / 10) * (Math.PI / 180);

/** Corners of a w×d rectangle centred on `c`, rotated by `ddeg` (counter-clockwise from +X). */
export function rotatedRectCorners(c: Vec2, w: number, d: number, ddeg: number): Vec2[] {
  const r = ddegToRad(ddeg);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const hw = w / 2;
  const hd = d / 2;
  return (
    [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ] as const
  ).map(([x, y]) => [c[0] + x * cos - y * sin, c[1] + x * sin + y * cos] as const);
}

export function boundsOf(points: readonly Vec2[], pad = 0): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

/** Is point `p` inside the w×d rectangle centred on `c` and rotated by `ddeg`? */
export function pointInRotatedRect(p: Vec2, c: Vec2, w: number, d: number, ddeg: number): boolean {
  const r = -ddegToRad(ddeg);
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  const lx = dx * Math.cos(r) - dy * Math.sin(r);
  const ly = dx * Math.sin(r) + dy * Math.cos(r);
  return Math.abs(lx) <= w / 2 && Math.abs(ly) <= d / 2;
}

export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const len2 = abx * abx + aby * aby;
  const t =
    len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / len2));
  return Math.hypot(p[0] - (a[0] + t * abx), p[1] - (a[1] + t * aby));
}

export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i];
    const pj = poly[j];
    if (!pi || !pj) continue;
    if (
      pi[1] > p[1] !== pj[1] > p[1] &&
      p[0] < ((pj[0] - pi[0]) * (p[1] - pi[1])) / (pj[1] - pi[1]) + pi[0]
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Where `p` falls along segment a→b: distance from `a` along it (unclamped), and off it. */
export function alongSegment(p: Vec2, a: Vec2, b: Vec2): { along: number; length: number } {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (length === 0) return { along: 0, length };
  return {
    along: ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / length,
    length,
  };
}

/** Do segments p1–p2 and q1–q2 cross or touch (sharing an endpoint counts)? */
export function segmentsIntersect(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2): boolean {
  const cross = (a: Vec2, b: Vec2, c: Vec2) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const onSegment = (a: Vec2, b: Vec2, c: Vec2) =>
    Math.min(a[0], b[0]) <= c[0] &&
    c[0] <= Math.max(a[0], b[0]) &&
    Math.min(a[1], b[1]) <= c[1] &&
    c[1] <= Math.max(a[1], b[1]);
  const d1 = cross(q1, q2, p1);
  const d2 = cross(q1, q2, p2);
  const d3 = cross(p1, p2, q1);
  const d4 = cross(p1, p2, q2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return (
    (d1 === 0 && onSegment(q1, q2, p1)) ||
    (d2 === 0 && onSegment(q1, q2, p2)) ||
    (d3 === 0 && onSegment(p1, p2, q1)) ||
    (d4 === 0 && onSegment(p1, p2, q2))
  );
}

/**
 * A valid zone outline (docs/0029, `polygon_invalid` in docs/0081): at least 3 corners, no
 * repeated corner, no zero area, and no edge crossing another.
 */
export function isSimplePolygon(points: readonly Vec2[]): boolean {
  const n = points.length;
  if (n < 3 || Math.abs(polygonArea(points)) === 0) return false;
  const keys = new Set(points.map((p) => `${p[0]},${p[1]}`));
  if (keys.size !== n) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Neighbouring edges share a corner by design.
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsIntersect(points[i]!, points[(i + 1) % n]!, points[j]!, points[(j + 1) % n]!)) {
        return false;
      }
    }
  }
  return true;
}

/** Signed area (positive when counter-clockwise). */
export function polygonArea(points: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}
