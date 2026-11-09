/**
 * Geometric hit-testing (docs/0052). The view passes a point in plan mm; the core decides what
 * was hit. Priority: attached objects (e.g. monitors) > other objects > columns > doors and
 * windows > walls; among equals, the one drawn last (topmost) wins. Zones are not hit-tested
 * here: clicking empty space returns null (pan / clear selection).
 */
import {
  alongSegment,
  boundsOf,
  distanceToSegment,
  pointInPolygon,
  pointInRotatedRect,
  polygonArea,
  rotatedRectCorners,
} from "./geometry";
import { type HeightFilter, isRaised } from "./heights";
import { catalogItemOf, type Plan, type Vec2, type Wall } from "./plan";
import { SpatialIndex } from "./spatialIndex";

export interface Hit {
  kind: "object" | "column" | "opening" | "wall" | "zone";
  id: string;
}

export interface HitIndex {
  objects: SpatialIndex;
  walls: SpatialIndex;
  drawOrder: ReadonlyMap<string, number>;
  wallsById: ReadonlyMap<string, Wall>;
}

export function buildHitIndex(plan: Plan): HitIndex {
  const objects = new SpatialIndex();
  const drawOrder = new Map<string, number>();
  plan.objectOrder.forEach((id, i) => {
    const obj = plan.objects[id];
    if (!obj) return;
    drawOrder.set(id, i);
    const item = catalogItemOf(plan, obj);
    const c: Vec2 = [obj.position[0], obj.position[1]];
    objects.insert(
      id,
      boundsOf(rotatedRectCorners(c, item.width_mm, item.depth_mm, obj.rotation_ddeg)),
    );
  });
  const walls = new SpatialIndex();
  for (const w of plan.walls) walls.insert(w.id, boundsOf([w.a, w.b], w.thickness_mm / 2));
  return { objects, walls, drawOrder, wallsById: new Map(plan.walls.map((w) => [w.id, w])) };
}

export function hitTest(plan: Plan, index: HitIndex, p: Vec2, tolerance_mm = 0): Hit | null {
  let best: { id: string; order: number } | null = null;
  for (const id of index.objects.queryPoint(p[0], p[1])) {
    const obj = plan.objects[id];
    if (!obj) continue;
    const item = catalogItemOf(plan, obj);
    const c: Vec2 = [obj.position[0], obj.position[1]];
    const w = item.width_mm + 2 * tolerance_mm;
    const d = item.depth_mm + 2 * tolerance_mm;
    if (!pointInRotatedRect(p, c, w, d, obj.rotation_ddeg)) continue;
    // The topmost wins: the draw order already puts attached and raised items above what's
    // below them (docs/0095).
    const order = index.drawOrder.get(id) ?? -1;
    if (!best || order > best.order) best = { id, order };
  }
  if (best) return { kind: "object", id: best.id };

  for (const c of plan.columns ?? []) {
    if (pointInPolygon(p, c.footprint)) return { kind: "column", id: c.id };
  }

  for (const id of index.walls.queryPoint(p[0], p[1])) {
    const w = index.wallsById.get(id);
    if (w && distanceToSegment(p, w.a, w.b) <= w.thickness_mm / 2 + tolerance_mm) {
      const { along } = alongSegment(p, w.a, w.b);
      const opening = plan.openings.find(
        (o) => o.wall_id === id && along >= o.offset_mm && along <= o.offset_mm + o.width_mm,
      );
      return opening ? { kind: "opening", id: opening.id } : { kind: "wall", id };
    }
  }
  return null;
}

/** The innermost (smallest) zone containing `p`, if any: zones are picked last. */
export function zoneAt(plan: Plan, p: Vec2): string | null {
  let best: { id: string; area: number } | null = null;
  for (const z of plan.zones) {
    if (!pointInPolygon(p, z.boundary)) continue;
    const area = Math.abs(polygonArea(z.boundary));
    if (!best || area < best.area) best = { id: z.id, area };
  }
  return best?.id ?? null;
}

/** The rectangle `half` mm either side of the segment a→b: a wall's or an opening's outline. */
function segmentCorners(a: Vec2, b: Vec2, half: number): Vec2[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = (-(b[1] - a[1]) / len) * half;
  const ny = ((b[0] - a[0]) / len) * half;
  return [
    [a[0] + nx, a[1] + ny],
    [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny],
    [a[0] - nx, a[1] - ny],
  ];
}

/**
 * What a selection rectangle from corner `a` to corner `b` catches (docs/0133): every wall,
 * door, window, column, zone and item whose whole outline is inside it. With the height filter
 * on Floor or Raised, the faded items aren't caught; the rest is never faded.
 */
export function inBox(plan: Plan, a: Vec2, b: Vec2, filter: HeightFilter = "all"): string[] {
  const [x0, x1] = a[0] < b[0] ? [a[0], b[0]] : [b[0], a[0]];
  const [y0, y1] = a[1] < b[1] ? [a[1], b[1]] : [b[1], a[1]];
  const inside = (ps: readonly Vec2[]) =>
    ps.every(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
  const ids: string[] = [];
  for (const w of plan.walls) {
    if (inside(segmentCorners(w.a, w.b, w.thickness_mm / 2))) ids.push(w.id);
  }
  const walls = new Map(plan.walls.map((w) => [w.id, w]));
  for (const o of plan.openings) {
    const w = walls.get(o.wall_id);
    if (!w) continue;
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1;
    const at = (along: number): Vec2 => [
      w.a[0] + ((w.b[0] - w.a[0]) * along) / len,
      w.a[1] + ((w.b[1] - w.a[1]) * along) / len,
    ];
    const span = segmentCorners(at(o.offset_mm), at(o.offset_mm + o.width_mm), w.thickness_mm / 2);
    if (inside(span)) ids.push(o.id);
  }
  for (const c of plan.columns ?? []) if (inside(c.footprint)) ids.push(c.id);
  for (const z of plan.zones) if (inside(z.boundary)) ids.push(z.id);
  for (const id of plan.objectOrder) {
    const o = plan.objects[id];
    if (!o) continue;
    // The filter fades the other group (docs/0095); what's faded isn't caught.
    if (filter !== "all" && isRaised(o) !== (filter === "raised")) continue;
    const item = catalogItemOf(plan, o);
    const c: Vec2 = [o.position[0], o.position[1]];
    if (inside(rotatedRectCorners(c, item.width_mm, item.depth_mm, o.rotation_ddeg))) ids.push(id);
  }
  return ids;
}

/** Selecting an object also selects everything attached to it (docs/0047, e.g. monitors). */
export function withAttachments(plan: Plan, ids: Iterable<string>): Set<string> {
  const result = new Set(ids);
  for (const id of plan.objectOrder) {
    const obj = plan.objects[id];
    if (obj?.attached_to && result.has(obj.attached_to)) result.add(id);
  }
  return result;
}

/** Move objects by (dx, dy) mm, returning a new plan; untouched objects keep their identity. */
export function moveObjects(plan: Plan, ids: ReadonlySet<string>, dx: number, dy: number): Plan {
  if (dx === 0 && dy === 0) return plan;
  const objects = { ...plan.objects };
  for (const id of ids) {
    const o = objects[id];
    if (!o) continue;
    // Whole millimetres only (docs/0029).
    objects[id] = {
      ...o,
      position: [Math.round(o.position[0] + dx), Math.round(o.position[1] + dy), o.position[2]],
    };
  }
  return { ...plan, objects };
}
