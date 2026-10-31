/**
 * The operations behind editing actions (docs/0050): each function returns the ops for one
 * user action, ready for `store.perform`. Pure, like the rest of the core (docs/0052).
 */
import { isSimplePolygon } from "./geometry";
import { type ApiPlan, newId, type Op } from "./operations";
import type { Plan, Vec2, Wall } from "./plan";

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
export function addObject(
  item: PlanCatalogItem,
  at: Vec2,
  rotationDdeg: number,
  attachedTo: string | null = null,
  id = newId(),
): Op {
  return {
    op: "add",
    kind: "object",
    id,
    data: {
      catalog_item_rev_id: item.id,
      position: [at[0], at[1], 0],
      rotation_ddeg: rotationDdeg,
      label: null,
      attached_to: attachedTo,
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
 * Makes a wall `lengthMm` long by moving one end along the wall. When exactly one end is joined
 * to other walls, the free end moves, so the corner stays (docs/0108), and the wall's doors and
 * windows keep their place on the plan. Otherwise the far end (b) moves, and the walls joined
 * there follow (docs/0044). Null when that can't be done: a length that isn't positive, or a door
 * or window that would no longer fit (opening_exceeds_wall, docs/0081).
 */
export function setWallLength(plan: Plan, wallId: string, lengthMm: number): Op[] | null {
  const w = plan.walls.find((x) => x.id === wallId);
  if (!w || !(lengthMm > 0)) return null;
  const l = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  const joined = (p: Vec2) => wallsAt(plan, p).length > 1;
  const openings = plan.openings.filter((o) => o.wall_id === wallId);
  if (joined(w.b) && !joined(w.a)) {
    const to: Vec2 = [
      Math.round(w.b[0] - ((w.b[0] - w.a[0]) / l) * lengthMm),
      Math.round(w.b[1] - ((w.b[1] - w.a[1]) / l) * lengthMm),
    ];
    // Offsets are measured from a, which moves: shift them by what the wall gains.
    const gained = Math.round(Math.hypot(w.b[0] - to[0], w.b[1] - to[1]) - l);
    if (
      openings.some((o) => o.offset_mm + gained < 0 || o.offset_mm + gained + o.width_mm > lengthMm)
    ) {
      return null;
    }
    const ops = moveJunction(plan, [wallId], w.a, to);
    if (!ops.length) return null;
    return [
      ...ops,
      ...openings.map((o): Op => ({
        op: "update",
        kind: "opening",
        id: o.id,
        data: { offset_mm: o.offset_mm + gained },
      })),
    ];
  }
  const to: Vec2 = [
    Math.round(w.a[0] + ((w.b[0] - w.a[0]) / l) * lengthMm),
    Math.round(w.a[1] + ((w.b[1] - w.a[1]) / l) * lengthMm),
  ];
  const tooLong = openings.some((o) => o.offset_mm + o.width_mm > lengthMm);
  const ops = moveJunction(plan, wallsAt(plan, w.b), w.b, to);
  return ops.length && !tooLong ? ops : null;
}

/**
 * Moves a whole wall by `d` (docs/0108): its ends, and the ends of `joinedA` and `joinedB` (the
 * walls joined at its ends, which stretch to stay joined) that meet them. One op per wall. No ops
 * if that would collapse a wall to a point.
 */
export function moveWall(
  plan: Plan,
  wallId: string,
  d: Vec2,
  joinedA: readonly string[],
  joinedB: readonly string[],
): Op[] {
  const w = plan.walls.find((x) => x.id === wallId);
  if (!w || (d[0] === 0 && d[1] === 0)) return [];
  const moves = (other: Wall, end: "a" | "b") =>
    other.id === wallId ||
    (joinedA.includes(other.id) && same(other[end], w.a)) ||
    (joinedB.includes(other.id) && same(other[end], w.b));
  return moveWallEnds(plan, moves, d) ?? [];
}

/**
 * Moves by `d` the wall ends that `moves` picks, for moving and nudging whole walls (docs/0044,
 * docs/0108). One op per wall. Null if that would collapse a wall to a point.
 */
function moveWallEnds(
  plan: Plan,
  moves: (w: Wall, end: "a" | "b") => boolean,
  d: Vec2,
): Op[] | null {
  const ops: Op[] = [];
  for (const w of plan.walls) {
    const data: Record<string, number[]> = {};
    for (const end of ["a", "b"] as const) {
      if (moves(w, end)) data[end] = [w[end][0] + d[0], w[end][1] + d[1]];
    }
    if (!Object.keys(data).length) continue;
    const [a, b] = [data.a ?? w.a, data.b ?? w.b];
    if (a[0] === b[0] && a[1] === b[1]) return null;
    ops.push({ op: "update", kind: "wall", id: w.id, data });
  }
  return ops;
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

/**
 * Moves the selection by `d`, as the arrow keys do (docs/0108): furniture and devices, columns,
 * zones, and whole walls, whose joined walls stretch to stay joined (as dragging one does). A door
 * or window on its own slides along its wall by the part of `d` along it, if it still fits. No
 * ops when nothing can move, or a wall would collapse to a point.
 */
export function nudgeOps(plan: Plan, selection: ReadonlySet<string>, d: Vec2): Op[] {
  const by = (p: readonly number[]): number[] => [p[0]! + d[0], p[1]! + d[1]];
  const ops: Op[] = [];
  for (const id of selection) {
    const o = plan.objects[id];
    if (o) {
      ops.push({
        op: "update",
        kind: "object",
        id,
        data: { position: [...by(o.position), o.position[2]] },
      });
    }
  }
  for (const c of plan.columns ?? []) {
    if (selection.has(c.id)) {
      ops.push({
        op: "update",
        kind: "column",
        id: c.id,
        data: { footprint: c.footprint.map(by) },
      });
    }
  }
  for (const z of plan.zones) {
    if (selection.has(z.id)) {
      ops.push({ op: "update", kind: "zone", id: z.id, data: { boundary: z.boundary.map(by) } });
    }
  }
  // Every end of a selected wall moves, and so does any other wall's end that meets it.
  const ends = plan.walls.filter((w) => selection.has(w.id)).flatMap((w) => [w.a, w.b]);
  const wallOps = moveWallEnds(plan, (w, end) => ends.some((q) => same(w[end], q)), d);
  if (!wallOps) return [];
  ops.push(...wallOps);
  for (const o of plan.openings) {
    const w = plan.walls.find((x) => x.id === o.wall_id);
    if (!selection.has(o.id) || !w || selection.has(w.id)) continue;
    const length = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    const along = Math.round((d[0] * (w.b[0] - w.a[0]) + d[1] * (w.b[1] - w.a[1])) / length);
    const offset = o.offset_mm + along;
    if (along !== 0 && offset >= 0 && offset + o.width_mm <= length) {
      ops.push({ op: "update", kind: "opening", id: o.id, data: { offset_mm: offset } });
    }
  }
  return ops;
}
