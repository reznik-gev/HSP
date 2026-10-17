/**
 * The editor's own plan checks (docs/0051, docs/0092 step 8): the server's changeset rules
 * (docs/0081) run in the browser as the user works, so problems show up before a change is
 * sent. The server still checks every changeset and has the last word. The two stay in step
 * through the shared cases in /shared/validation-cases, which both run in CI.
 *
 * Geometry (docs/0092 step 9, backend hsp.plans.geometry_checks): zones overlapping partly, and
 * a nested zone sticking out of its parent (docs/0034 invariant 1), are errors; an item standing in a door's swing or over a column, and a seat without a label, are
 * warnings. "Overlap" means sharing more than 1 mm², and "inside" all but 1 mm², so rooms that
 * only share a wall line don't overlap.
 */
import { intersectionArea, isSimplePolygon, polygonArea, rotatedRectCorners } from "./geometry";
import type { ApiPlan } from "./operations";
import type { Vec2 } from "./plan";

export interface Finding {
  code: string;
  severity: "error" | "warning";
  elementId: string;
}

export interface CheckRefs {
  zoneTypeIds: ReadonlySet<string>;
  /** Devices that exist; unknown in the editor (null), where the server checks them. */
  deviceIds: ReadonlySet<string> | null;
}

/** A valid outline for the server too: 3+ distinct corners, an area, no crossing edges. */
function polygonOk(points: readonly (readonly number[])[]): boolean {
  return new Set(points.map((p) => `${p[0]},${p[1]}`)).size >= 3 && isSimplePolygon(dedupe(points));
}

/** The outline without a corner repeated right after itself. */
function dedupe(points: readonly (readonly number[])[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of points) {
    const last = out.at(-1);
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push([p[0]!, p[1]!]);
  }
  return out;
}

/** Square millimetres two shapes may share and still count as apart. */
const AREA_EPS = 1;
/** Segments in a door's quarter-circle swing; the server uses the same. */
const SWING_SEGMENTS = 8;

/** The floor a door sweeps: a quarter circle about its hinge, or null if it doesn't swing. */
export function doorSwing(
  opening: ApiPlan["openings"][number],
  wall: ApiPlan["walls"][number],
): Vec2[] | null {
  if (opening.type !== "door" || opening.swing === "sliding" || opening.swing === "none") {
    return null;
  }
  const length = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
  if (length === 0) return null;
  const ux = (wall.b[0] - wall.a[0]) / length;
  const uy = (wall.b[1] - wall.a[1]) / length;
  const start: Vec2 = [wall.a[0] + ux * opening.offset_mm, wall.a[1] + uy * opening.offset_mm];
  const end: Vec2 = [start[0] + ux * opening.width_mm, start[1] + uy * opening.width_mm];
  const [hinge, other] = opening.swing.startsWith("left") ? [start, end] : [end, start];
  // Closed, the leaf lies along the wall; open, square to it on the "in" side (the wall's left).
  const r = opening.width_mm;
  const cx = (other[0] - hinge[0]) / r;
  const cy = (other[1] - hinge[1]) / r;
  const side = opening.swing.endsWith("_in") ? 1 : -1;
  const nx = -uy * side;
  const ny = ux * side;
  const points: Vec2[] = [hinge];
  for (let i = 0; i <= SWING_SEGMENTS; i++) {
    const t = (Math.PI / 2) * (i / SWING_SEGMENTS);
    points.push([
      hinge[0] + r * (Math.cos(t) * cx + Math.sin(t) * nx),
      hinge[1] + r * (Math.cos(t) * cy + Math.sin(t) * ny),
    ]);
  }
  return points;
}

export function checkPlan(plan: ApiPlan, refs: CheckRefs): Finding[] {
  const found: Finding[] = [];
  const error = (code: string, elementId: string) =>
    found.push({ code, severity: "error", elementId });
  const warning = (code: string, elementId: string) =>
    found.push({ code, severity: "warning", elementId });
  const walls = new Map(plan.walls.map((w) => [w.id, w]));
  const zones = new Map(plan.zones.map((z) => [z.id, z]));
  const objects = new Map(plan.objects.map((o) => [o.id, o]));

  for (const w of plan.walls) {
    if (w.a[0] === w.b[0] && w.a[1] === w.b[1]) error("wall_degenerate", w.id);
  }

  for (const o of plan.openings) {
    const w = walls.get(o.wall_id);
    if (!w) {
      error("reference_missing", o.id);
      continue;
    }
    const length = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    if (o.offset_mm + o.width_mm > length + 1e-9) error("opening_exceeds_wall", o.id);
  }

  for (const c of plan.columns) if (!polygonOk(c.footprint)) error("polygon_invalid", c.id);

  for (const z of plan.zones) {
    if (!polygonOk(z.boundary)) error("polygon_invalid", z.id);
    if (!refs.zoneTypeIds.has(z.zone_type_id)) error("reference_missing", z.id);
    if (!z.parent_zone_id) continue;
    if (!zones.has(z.parent_zone_id)) {
      error("reference_missing", z.id);
      continue;
    }
    const seen = new Set([z.id]);
    for (let cursor = zones.get(z.parent_zone_id); cursor;) {
      if (seen.has(cursor.id)) {
        error("zone_cycle", z.id);
        break;
      }
      seen.add(cursor.id);
      cursor = cursor.parent_zone_id ? zones.get(cursor.parent_zone_id) : undefined;
    }
  }

  // Zones overlapping partly, unless one is nested in the other on purpose.
  const outlines = new Map(
    plan.zones.filter((z) => polygonOk(z.boundary)).map((z) => [z.id, dedupe(z.boundary)]),
  );
  const ancestors = (id: string) => {
    const found = new Set<string>();
    for (let c = zones.get(zones.get(id)?.parent_zone_id ?? ""); c && !found.has(c.id);) {
      found.add(c.id);
      c = c.parent_zone_id ? zones.get(c.parent_zone_id) : undefined;
    }
    return found;
  };
  for (const z of plan.zones) {
    const child = outlines.get(z.id);
    const parent = z.parent_zone_id ? outlines.get(z.parent_zone_id) : undefined;
    if (!child || !parent) continue; // reference_missing or polygon_invalid covers it
    if (intersectionArea(child, parent) < Math.abs(polygonArea(child)) - AREA_EPS) {
      error("zone_outside_parent", z.id);
    }
  }

  const shaped = [...outlines.keys()];
  for (let i = 0; i < shaped.length; i++) {
    for (let j = i + 1; j < shaped.length; j++) {
      const [a, b] = [shaped[i]!, shaped[j]!];
      if (ancestors(a).has(b) || ancestors(b).has(a)) continue;
      const pa = outlines.get(a)!;
      const pb = outlines.get(b)!;
      const shared = intersectionArea(pa, pb);
      const inside =
        shared >= Math.abs(polygonArea(pa)) - AREA_EPS ||
        shared >= Math.abs(polygonArea(pb)) - AREA_EPS;
      if (shared > AREA_EPS && !inside) {
        error("zone_overlap", a);
        error("zone_overlap", b);
      }
    }
  }

  const swings = plan.openings.flatMap((o) => {
    const w = walls.get(o.wall_id);
    const swing = w && doorSwing(o, w);
    return swing ? [swing] : [];
  });
  const columns = plan.columns
    .filter((c) => polygonOk(c.footprint))
    .map((c) => dedupe(c.footprint));

  const deviceOwner = new Map<string, string>();
  for (const o of plan.objects) {
    const item = plan.catalog[o.catalog_item_rev_id];
    if (!item) {
      error("reference_missing", o.id);
      continue;
    }
    if (o.position[2] !== 0 && !item.mountable) error("not_mountable", o.id);
    if (item.is_seat && !o.allocation_mode) error("allocation_mode_required", o.id);
    if (!item.is_seat && o.allocation_mode) error("allocation_mode_not_seat", o.id);
    if (o.attached_to) {
      const host = objects.get(o.attached_to);
      const hostItem = host && plan.catalog[host.catalog_item_rev_id];
      if (!host) error("reference_missing", o.id);
      else if (
        host.id === o.id ||
        !hostItem ||
        !item.attaches_to_categories.includes(hostItem.category)
      ) {
        error("attach_not_allowed", o.id);
      }
    }
    if (item.is_seat && !o.label) warning("seat_without_label", o.id);
    if (item.footprint_blocks && !o.attached_to) {
      const rect = rotatedRectCorners(
        [o.position[0], o.position[1]],
        item.width_mm,
        item.depth_mm,
        o.rotation_ddeg,
      );
      for (const swing of swings) {
        if (intersectionArea(rect, swing) > AREA_EPS) warning("item_in_door_swing", o.id);
      }
      for (const column of columns) {
        if (intersectionArea(rect, column) > AREA_EPS) warning("item_over_column", o.id);
      }
    }
    if (o.device_id) {
      if (refs.deviceIds && !refs.deviceIds.has(o.device_id)) error("reference_missing", o.id);
      else if (deviceOwner.has(o.device_id)) error("device_placed_twice", o.id);
      else deviceOwner.set(o.device_id, o.id);
    }
  }
  return found;
}
