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
