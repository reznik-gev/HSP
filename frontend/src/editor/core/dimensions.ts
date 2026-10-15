/**
 * Dimensions on the plan (docs/0045, docs/0092 step 4), for a single selected wall or item:
 *
 * - a wall: its length, drawn beside it; editing it moves the far end (walls joined there
 *   follow);
 * - an item: its distance to the nearest wall face east, north, west and south (the sides of
 *   its outline, as drawn); editing one moves the item along that line until it's that far.
 *
 * Pure: the view draws them and turns an edit into `edit(value)`'s operations.
 */
import { setWallLength } from "./edits";
import { rotatedRectCorners } from "./geometry";
import type { Op } from "./operations";
import type { Plan, Vec2 } from "./plan";

export interface Dimension {
  key: string;
  /** The measured line, in plan mm. */
  from: Vec2;
  to: Vec2;
  valueMm: number;
  /** The operations for a new value, or null when it can't be done. */
  edit(valueMm: number): Op[] | null;
}

/** Items further than this from a wall get no dimension that way. */
const MAX_REACH_MM = 20_000;

const DIRECTIONS: { key: string; dir: Vec2 }[] = [
  { key: "east", dir: [1, 0] },
  { key: "north", dir: [0, 1] },
  { key: "west", dir: [-1, 0] },
  { key: "south", dir: [0, -1] },
];

export function dimensionsFor(
  plan: Plan,
  selection: ReadonlySet<string>,
  /** How far beside a wall its dimension is drawn, in mm (about 20 screen px). */
  offsetMm: number,
): Dimension[] {
  if (selection.size === 0) return [];
  const ids = [...selection];
  const wall = ids.length === 1 ? plan.walls.find((w) => w.id === ids[0]) : undefined;
  if (wall) {
    const len = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
    if (!len) return [];
    // Beside the wall, on its left (looking from a to b).
    const nx = -(wall.b[1] - wall.a[1]) / len;
    const ny = (wall.b[0] - wall.a[0]) / len;
    const off = wall.thickness_mm / 2 + offsetMm;
    return [
      {
        key: "length",
        from: [wall.a[0] + nx * off, wall.a[1] + ny * off],
        to: [wall.b[0] + nx * off, wall.b[1] + ny * off],
        valueMm: Math.round(len),
        edit: (v) => setWallLength(plan, wall.id, v),
      },
    ];
  }
  // A single item, with whatever is attached to it.
  const own = ids.filter((id) => {
    const o = plan.objects[id];
    return o && !(o.attached_to && selection.has(o.attached_to));
  });
  const obj = own.length === 1 ? plan.objects[own[0]!] : undefined;
  const item = obj && plan.catalog[obj.catalog_item_rev_id];
  if (!obj || !item || ids.some((id) => !plan.objects[id])) return [];
  const c: Vec2 = [obj.position[0], obj.position[1]];
  const corners = rotatedRectCorners(c, item.width_mm, item.depth_mm, obj.rotation_ddeg);
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  const extent = {
    east: Math.max(...xs),
    west: Math.min(...xs),
    north: Math.max(...ys),
    south: Math.min(...ys),
  };

  const out: Dimension[] = [];
  for (const { key, dir } of DIRECTIONS) {
    // The item's edge on that side, level with its centre.
    const edge: Vec2 =
      dir[0] !== 0
        ? [dir[0] > 0 ? extent.east : extent.west, c[1]]
        : [c[0], dir[1] > 0 ? extent.north : extent.south];
    let best: { face: Vec2; gap: number } | null = null;
    for (const w of plan.walls) {
      const hit = rayHitsSegment(c, dir, w.a, w.b);
      if (hit === null) continue;
      // Along the ray, the wall's near face is half its thickness before the centreline
      // (measured square to the wall, projected onto the ray).
      const wl = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      const cos = Math.abs((-(w.b[1] - w.a[1]) / wl) * dir[0] + ((w.b[0] - w.a[0]) / wl) * dir[1]);
      if (cos < 1e-6) continue; // the ray runs along the wall
      const faceT = hit - w.thickness_mm / 2 / cos;
      const edgeT = Math.abs(dir[0] !== 0 ? edge[0] - c[0] : edge[1] - c[1]);
      const gap = faceT - edgeT;
      if (gap < 0 || gap > MAX_REACH_MM || (best && gap >= best.gap)) continue;
      best = { face: [c[0] + dir[0] * faceT, c[1] + dir[1] * faceT], gap };
    }
    if (!best) continue;
    const gap = best.gap;
    out.push({
      key,
      from: edge,
      to: best.face,
      valueMm: Math.round(gap),
      edit: (v) => {
        if (!(v >= 0)) return null;
        // Closer to the wall by (gap − v); what's attached moves along.
        const shift = gap - v;
        return [...selection].flatMap((id): Op[] => {
          const o = plan.objects[id];
          if (!o) return [];
          const position = [
            Math.round(o.position[0] + dir[0] * shift),
            Math.round(o.position[1] + dir[1] * shift),
            o.position[2],
          ];
          return [{ op: "update", kind: "object", id, data: { position } }];
        });
      },
    });
  }
  return out;
}

/** How far along the ray from `o` in direction `d` (unit) it crosses segment a–b, or null. */
function rayHitsSegment(o: Vec2, d: Vec2, a: Vec2, b: Vec2): number | null {
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const den = d[0] * ey - d[1] * ex;
  if (Math.abs(den) < 1e-9) return null;
  const ax = a[0] - o[0];
  const ay = a[1] - o[1];
  const t = (ax * ey - ay * ex) / den;
  const u = (ax * d[1] - ay * d[0]) / den;
  return t > 0 && u >= 0 && u <= 1 ? t : null;
}
