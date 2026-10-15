/**
 * The editor's own plan checks (docs/0051, docs/0092 step 8): the server's changeset rules
 * (docs/0081) run in the browser as the user works, so problems show up before a change is
 * sent. The server still checks every changeset and has the last word. The two stay in step
 * through the shared cases in /shared/validation-cases, which both run in CI.
 */
import { isSimplePolygon } from "./geometry";
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

export function checkPlan(plan: ApiPlan, refs: CheckRefs): Finding[] {
  const found: Finding[] = [];
  const error = (code: string, elementId: string) =>
    found.push({ code, severity: "error", elementId });
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
    if (o.device_id) {
      if (refs.deviceIds && !refs.deviceIds.has(o.device_id)) error("reference_missing", o.id);
      else if (deviceOwner.has(o.device_id)) error("device_placed_twice", o.id);
      else deviceOwner.set(o.device_id, o.id);
    }
  }
  return found;
}
