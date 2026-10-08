/**
 * Virtual wall junction graph (docs/0044): walls stay independent 2-point segments; endpoints
 * that are exactly equal form junctions. For rendering, walls of equal thickness joined
 * end-to-end are chained into polylines so SVG draws mitred corners natively.
 */
import type { Vec2, Wall } from "./plan";

export interface WallChain {
  thickness_mm: number;
  points: Vec2[];
  closed: boolean;
}

const key = (p: Vec2) => `${p[0]},${p[1]}`;

export function wallChains(walls: readonly Wall[]): WallChain[] {
  const byPoint = new Map<string, Wall[]>();
  for (const w of walls) {
    for (const p of [w.a, w.b]) {
      const list = byPoint.get(key(p));
      if (list) list.push(w);
      else byPoint.set(key(p), [w]);
    }
  }
  /** The single other wall at a degree-2 junction with the same thickness, if any.
   *  T-junctions and crossings break chains (butt joins, docs/0044). */
  const continuation = (p: Vec2, from: Wall): Wall | undefined => {
    const others = (byPoint.get(key(p)) ?? []).filter((o) => o !== from);
    const only = others.length === 1 ? others[0] : undefined;
    return only && only.thickness_mm === from.thickness_mm ? only : undefined;
  };
  const farEnd = (w: Wall, p: Vec2): Vec2 => (key(w.a) === key(p) ? w.b : w.a);

  const used = new Set<Wall>();
  const chains: WallChain[] = [];
  for (const start of walls) {
    if (used.has(start)) continue;
    used.add(start);
    const points: Vec2[] = [start.a, start.b];

    // Walk forwards from b, then backwards from a.
    for (const [from, append] of [
      [start.b, (p: Vec2) => points.push(p)],
      [start.a, (p: Vec2) => points.unshift(p)],
    ] as const) {
      let at: Vec2 = from;
      let cur: Wall = start;
      for (
        let next = continuation(at, cur);
        next && !used.has(next);
        next = continuation(at, cur)
      ) {
        used.add(next);
        at = farEnd(next, at);
        append(at);
        cur = next;
      }
    }

    const first = points[0];
    const last = points[points.length - 1];
    const closed = points.length > 3 && !!first && !!last && key(first) === key(last);
    chains.push({
      thickness_mm: start.thickness_mm,
      points: closed ? points.slice(0, -1) : points,
      closed,
    });
  }
  return chains;
}
