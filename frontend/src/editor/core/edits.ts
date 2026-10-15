/**
 * The operations behind editing actions (docs/0050): each function returns the ops for one
 * user action, ready for `store.perform`. Pure, like the rest of the core (docs/0052).
 */
import { isSimplePolygon } from "./geometry";
import { type ApiPlan, newId, type Op } from "./operations";
import type { Plan, Vec2 } from "./plan";

export interface WallDefaults {
  thickness_mm: number;
  height_mm: number;
}

const same = (p: Vec2, q: Vec2) => p[0] === q[0] && p[1] === q[1];

export type OpeningType = "door" | "window";

/** Standard sizes for new doors and windows; the Properties panel changes them. */
export const OPENING_DEFAULTS: Record<
  OpeningType,
  { width_mm: number; height_mm: number; sill_mm: number; swing: string }
> = {
  door: { width_mm: 900, height_mm: 2100, sill_mm: 0, swing: "left_in" },
  window: { width_mm: 1200, height_mm: 1200, sill_mm: 900, swing: "none" },
};

/** Default column: 40 × 40 cm. */
export const COLUMN_SIZE_MM = 400;

export function addOpening(type: OpeningType, wallId: string, offsetMm: number, id = newId()): Op {
  return {
    op: "add",
    kind: "opening",
    id,
    data: { wall_id: wallId, type, offset_mm: offsetMm, ...OPENING_DEFAULTS[type] },
  };
}

/** A square footprint centred on `c`. */
export function squareAround(c: Vec2, size = COLUMN_SIZE_MM): Vec2[] {
  const h = size / 2;
  return [
    [c[0] - h, c[1] - h],
    [c[0] + h, c[1] - h],
    [c[0] + h, c[1] + h],
    [c[0] - h, c[1] + h],
  ];
}

export function addColumn(footprint: readonly Vec2[], heightMm: number, id = newId()): Op {
  return {
    op: "add",
    kind: "column",
    id,
    data: { footprint: footprint.map((p) => [p[0], p[1]]), height_mm: heightMm },
  };
}

export function addZone(
  name: string,
  zoneTypeId: string,
  boundary: readonly Vec2[],
  id = newId(),
): Op {
  return {
    op: "add",
    kind: "zone",
    id,
    data: {
      name,
      zone_type_id: zoneTypeId,
      parent_zone_id: null,
      boundary: boundary.map((p) => [p[0], p[1]]),
    },
  };
}

/** Moves one corner of a zone, unless that would make its outline invalid. */
export function moveZoneVertex(plan: Plan, zoneId: string, index: number, to: Vec2): Op[] {
  const zone = plan.zones.find((z) => z.id === zoneId);
  if (!zone) return [];
  const boundary = zone.boundary.map((p, i) => (i === index ? to : p));
  if (!isSimplePolygon(boundary)) return [];
  return [
    {
      op: "update",
      kind: "zone",
      id: zoneId,
      data: { boundary: boundary.map((p) => [p[0], p[1]]) },
    },
  ];
}

/** A catalog item as a plan carries it (docs/0021): one revision of the item. */
export type PlanCatalogItem = ApiPlan["catalog"][string];

/** A new object from the catalog. Seats start as assigned seats (docs/0009). */
export function addObject(item: PlanCatalogItem, at: Vec2, rotationDdeg: number, id = newId()): Op {
  return {
    op: "add",
    kind: "object",
    id,
    data: {
      catalog_item_rev_id: item.id,
      position: [at[0], at[1], 0],
      rotation_ddeg: rotationDdeg,
      label: null,
      attached_to: null,
      allocation_mode: item.is_seat ? "assigned" : null,
    },
  };
}

/** Turns the selected objects a quarter turn anticlockwise about their own centres. */
export function rotateObjects(plan: Plan, selection: ReadonlySet<string>, byDdeg = 900): Op[] {
  return plan.objectOrder
    .filter((id) => selection.has(id))
    .map((id) => {
      const o = plan.objects[id]!;
      const rotation_ddeg = (((o.rotation_ddeg + byDdeg) % 3600) + 3600) % 3600;
      return { op: "update", kind: "object", id, data: { rotation_ddeg } };
    });
}

export function addWall(a: Vec2, b: Vec2, defaults: WallDefaults, id = newId()): Op {
  return {
    op: "add",
    kind: "wall",
    id,
    data: { a: [a[0], a[1]], b: [b[0], b[1]], ...defaults },
  };
}

/**
 * Deletes the selected walls, doors, windows, columns, zones and objects. A zone takes the
 * zones nested in it (`zone_has_children`), deepest first. A wall takes its doors and windows along, and an
 * object the objects attached to it (docs/0081 cascades), as explicit ops so undo restores them.
 */
export function deleteSelection(plan: Plan, selection: ReadonlySet<string>): Op[] {
  const ops: Op[] = [];
  const walls = new Set(plan.walls.filter((w) => selection.has(w.id)).map((w) => w.id));
  for (const o of plan.openings) {
    if (walls.has(o.wall_id) || selection.has(o.id)) {
      ops.push({ op: "delete", kind: "opening", id: o.id });
    }
  }
  for (const id of walls) ops.push({ op: "delete", kind: "wall", id });
  for (const c of plan.columns ?? []) {
    if (selection.has(c.id)) ops.push({ op: "delete", kind: "column", id: c.id });
  }
  const zones: string[] = [];
  const visit = (id: string) => {
    for (const child of plan.zones.filter((z) => z.parent_zone_id === id)) visit(child.id);
    if (!zones.includes(id)) zones.push(id);
  };
  for (const z of plan.zones) if (selection.has(z.id)) visit(z.id);
  for (const id of zones) ops.push({ op: "delete", kind: "zone", id });
  // Attached objects first, then their hosts.
  const objects = plan.objectOrder.filter((id) => {
    const o = plan.objects[id];
    return o && (selection.has(id) || (o.attached_to && selection.has(o.attached_to)));
  });
  objects.sort(
    (x, y) => Number(!plan.objects[x]?.attached_to) - Number(!plan.objects[y]?.attached_to),
  );
  for (const id of objects) ops.push({ op: "delete", kind: "object", id });
  return ops;
}

/** The walls with an endpoint exactly at `p`: a junction (docs/0044). */
export function wallsAt(plan: Plan, p: Vec2): string[] {
  return plan.walls.filter((w) => same(w.a, p) || same(w.b, p)).map((w) => w.id);
}

/**
 * Moves the endpoints at `from` of the given walls to `to` (dragging a junction moves every
 * connected wall, docs/0044). Returns no ops if that would collapse a wall to a point.
 */
export function moveJunction(plan: Plan, wallIds: readonly string[], from: Vec2, to: Vec2): Op[] {
  if (same(from, to)) return [];
  const ops: Op[] = [];
  for (const id of wallIds) {
    const w = plan.walls.find((x) => x.id === id);
    if (!w) continue;
    const data: Record<string, number[]> = {};
    if (same(w.a, from)) data.a = [to[0], to[1]];
    if (same(w.b, from)) data.b = [to[0], to[1]];
    const a = data.a ?? w.a;
    const b = data.b ?? w.b;
    if (a[0] === b[0] && a[1] === b[1]) return [];
    if (Object.keys(data).length) ops.push({ op: "update", kind: "wall", id, data });
  }
  return ops;
}
