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

const cross = (o: Vec2, a: Vec2, b: Vec2) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Triangles covering a simple polygon exactly (ear clipping), each counter-clockwise. */
export function triangulate(points: readonly Vec2[]): Vec2[][] {
  const pts = polygonArea(points) < 0 ? [...points].reverse() : [...points];
  const ring = pts.map((_, i) => i);
  const triangles: Vec2[][] = [];
  const inside = (p: Vec2, a: Vec2, b: Vec2, c: Vec2) =>
    cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  const same = (p: Vec2, q: Vec2) => p[0] === q[0] && p[1] === q[1];
  while (ring.length > 3) {
    let clipped = false;
    for (let i = 0; i < ring.length; i++) {
      const a = pts[ring[(i + ring.length - 1) % ring.length]!]!;
      const b = pts[ring[i]!]!;
      const c = pts[ring[(i + 1) % ring.length]!]!;
      const turn = cross(a, b, c);
      if (turn < 0) continue; // a reflex corner isn't an ear
      // A corner on a straight line adds nothing; an ear holds no other corner.
      const blocked =
        turn > 0 &&
        ring.some((j) => {
          const p = pts[j]!;
          return !same(p, a) && !same(p, b) && !same(p, c) && inside(p, a, b, c);
        });
      if (blocked) continue;
      if (turn > 0) triangles.push([a, b, c]);
      ring.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) return triangles; // not a simple polygon; the outline check reports it
  }
  if (ring.length === 3) triangles.push(ring.map((j) => pts[j]!));
  return triangles;
}

/** The part of a convex counter-clockwise polygon inside another (Sutherland–Hodgman). */
function clipConvex(subject: readonly Vec2[], clip: readonly Vec2[]): Vec2[] {
  let out: Vec2[] = [...subject];
  for (let i = 0; i < clip.length && out.length > 0; i++) {
    const a = clip[i]!;
    const b = clip[(i + 1) % clip.length]!;
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j]!;
      const q = input[(j + 1) % input.length]!;
      const cp = cross(a, b, p);
      const cq = cross(a, b, q);
      if (cp >= 0) out.push(p);
      if (cp >= 0 !== cq >= 0) {
        const t = cp / (cp - cq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
  }
  return out;
}

/** The area two simple polygons share, in square plan units. */
export function intersectionArea(a: readonly Vec2[], b: readonly Vec2[]): number {
  const tb = triangulate(b);
  let area = 0;
  for (const ta of triangulate(a)) {
    for (const t of tb) area += Math.abs(polygonArea(clipConvex(ta, t)));
  }
  return area;
}
