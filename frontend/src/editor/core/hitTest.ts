/**
 * Geometric hit-testing (docs/0052). The view passes a point in plan mm; the core decides what
 * was hit. Priority: attached objects (e.g. monitors) > other objects > walls; among equals,
 * the one drawn last (topmost) wins. Zones are not hit-tested here: clicking empty space
 * returns null (pan / clear selection).
 */
import { boundsOf, distanceToSegment, pointInRotatedRect, rotatedRectCorners } from "./geometry";
import { catalogItemOf, type Plan, type Vec2, type Wall } from "./plan";
import { SpatialIndex } from "./spatialIndex";

export interface Hit {
  kind: "object" | "wall";
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
  let best: { id: string; rank: number; order: number } | null = null;
  for (const id of index.objects.queryPoint(p[0], p[1])) {
    const obj = plan.objects[id];
    if (!obj) continue;
    const item = catalogItemOf(plan, obj);
    const c: Vec2 = [obj.position[0], obj.position[1]];
    const w = item.width_mm + 2 * tolerance_mm;
    const d = item.depth_mm + 2 * tolerance_mm;
    if (!pointInRotatedRect(p, c, w, d, obj.rotation_ddeg)) continue;
    const rank = obj.attached_to ? 2 : 1;
    const order = index.drawOrder.get(id) ?? -1;
    if (!best || rank > best.rank || (rank === best.rank && order > best.order)) {
      best = { id, rank, order };
    }
  }
  if (best) return { kind: "object", id: best.id };

  for (const id of index.walls.queryPoint(p[0], p[1])) {
    const w = index.wallsById.get(id);
    if (w && distanceToSegment(p, w.a, w.b) <= w.thickness_mm / 2 + tolerance_mm) {
      return { kind: "wall", id };
    }
  }
  return null;
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
