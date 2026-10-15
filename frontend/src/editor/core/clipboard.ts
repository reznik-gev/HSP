/**
 * Copy and paste, also between floors (docs/0049, docs/0092 step 7). A copy is a fragment of a
 * plan in API shape, plus the catalog entries its items need. Pasting gives every element a new
 * id (and points doors, attached items and nested zones at the new ones), drops device links (a
 * device is placed once), clears seat labels (unique per building), keeps doors and windows
 * only with their wall, and pastes an attached item that came without its host standing alone.
 */
import { boundsOf } from "./geometry";
import { type ApiPlan, newId, type Op } from "./operations";
import type { Vec2 } from "./plan";

type P = ApiPlan;

export interface Fragment {
  format: "hsp-plan-fragment";
  version: 1;
  walls: P["walls"];
  openings: P["openings"];
  columns: P["columns"];
  zones: P["zones"];
  objects: P["objects"];
  catalog: P["catalog"];
}

/** The selection as a fragment; what's attached to selected items comes along. */
export function copyFragment(doc: ApiPlan, selection: ReadonlySet<string>): Fragment | null {
  const walls = doc.walls.filter((w) => selection.has(w.id));
  const wallIds = new Set(walls.map((w) => w.id));
  const objects = doc.objects.filter(
    (o) => selection.has(o.id) || (o.attached_to ? selection.has(o.attached_to) : false),
  );
  const fragment: Fragment = {
    format: "hsp-plan-fragment",
    version: 1,
    walls,
    // A door or window needs its wall.
    openings: doc.openings.filter((o) => wallIds.has(o.wall_id)),
    columns: doc.columns.filter((c) => selection.has(c.id)),
    zones: doc.zones.filter((z) => selection.has(z.id)),
    objects,
    catalog: Object.fromEntries(
      [...new Set(objects.map((o) => o.catalog_item_rev_id))]
        .filter((id) => doc.catalog[id])
        .map((id) => [id, doc.catalog[id]!]),
    ),
  };
  const empty =
    !walls.length && !fragment.columns.length && !fragment.zones.length && !objects.length;
  return empty ? null : structuredClone(fragment);
}

/** Every point of the fragment, for its outline. */
function points(f: Fragment): Vec2[] {
  return [
    ...f.walls.flatMap((w) => [w.a as Vec2, w.b as Vec2]),
    ...f.columns.flatMap((c) => c.footprint as Vec2[]),
    ...f.zones.flatMap((z) => z.boundary as Vec2[]),
    ...f.objects.map((o) => [o.position[0], o.position[1]] as Vec2),
  ];
}

/** The centre of the fragment's outline: pasting at the pointer puts it there. */
export function fragmentCentre(f: Fragment): Vec2 {
  const b = boundsOf(points(f));
  return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
}

/** The operations that paste `f` moved by `offset` (mm), and the new ids to select. */
export function pasteOps(f: Fragment, offset: Vec2): { ops: Op[]; ids: string[] } {
  const ids = new Map<string, string>();
  const fresh = (old: string) => {
    const id = newId();
    ids.set(old, id);
    return id;
  };
  const move = (p: readonly number[]) => [
    Math.round(p[0]! + offset[0]),
    Math.round(p[1]! + offset[1]),
  ];
  const ops: Op[] = [];
  for (const w of f.walls) {
    ops.push({
      op: "add",
      kind: "wall",
      id: fresh(w.id),
      data: { ...strip(w), a: move(w.a), b: move(w.b) },
    });
  }
  for (const c of f.columns) {
    ops.push({
      op: "add",
      kind: "column",
      id: fresh(c.id),
      data: { ...strip(c), footprint: c.footprint.map(move) },
    });
  }
  // Parents before nested zones; a parent that wasn't copied leaves the zone at the top level.
  const zones = [...f.zones].sort(
    (a, b) => Number(Boolean(a.parent_zone_id)) - Number(Boolean(b.parent_zone_id)),
  );
  for (const z of zones) fresh(z.id);
  for (const z of zones) {
    ops.push({
      op: "add",
      kind: "zone",
      id: ids.get(z.id)!,
      data: {
        ...strip(z),
        parent_zone_id: z.parent_zone_id ? (ids.get(z.parent_zone_id) ?? null) : null,
        boundary: z.boundary.map(move),
      },
    });
  }
  for (const o of f.openings) {
    ops.push({
      op: "add",
      kind: "opening",
      id: fresh(o.id),
      data: { ...strip(o), wall_id: ids.get(o.wall_id)! },
    });
  }
  // Hosts before what's attached to them.
  const objects = [...f.objects].sort(
    (a, b) => Number(Boolean(a.attached_to)) - Number(Boolean(b.attached_to)),
  );
  for (const o of objects) fresh(o.id);
  for (const o of objects) {
    ops.push({
      op: "add",
      kind: "object",
      id: ids.get(o.id)!,
      data: {
        ...strip(o),
        position: [...move(o.position), o.position[2]],
        label: null,
        device_id: null,
        attached_to: o.attached_to ? (ids.get(o.attached_to) ?? null) : null,
      },
    });
  }
  return { ops, ids: [...ids.values()] };
}

/** An element's fields without its id (the paste gives it a new one). */
function strip<T extends { id: string }>(element: T): Omit<T, "id"> {
  const data: Partial<T> = { ...element };
  delete data.id;
  return data as Omit<T, "id">;
}

/** Reads a fragment from clipboard text; null if it isn't one. */
export function parseFragment(text: string): Fragment | null {
  try {
    const f = JSON.parse(text) as Partial<Fragment>;
    return f.format === "hsp-plan-fragment" && f.version === 1 ? (f as Fragment) : null;
  } catch {
    return null;
  }
}
