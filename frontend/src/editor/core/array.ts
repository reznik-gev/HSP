/**
 * Arrays (docs/0049, docs/0092 step 5): the selected items repeated into rows × columns with a
 * spacing, optionally mirrored on alternate rows so desks face each other back to back (a
 * bench). One changeset. Copies are new items: new ids, no seat label (labels are unique per
 * building, docs/0034; seat numbering labels them), no device (a device is placed once,
 * docs/0049); what's attached to a copied host is copied onto the copy.
 */
import type { Op } from "./operations";
import { newId } from "./operations";
import type { Vec2 } from "./plan";
import type { ApiPlan } from "./operations";

export interface ArraySpec {
  rows: number;
  columns: number;
  /** Distance between columns (east) and rows (north), in mm. */
  dx: number;
  dy: number;
  /** Odd rows are mirrored north–south about the selection's centre: back-to-back desks. */
  mirror: boolean;
}

/** One copy: where an original item lands. */
export interface ArrayCopy {
  sourceId: string;
  position: Vec2;
  rotation_ddeg: number;
}

type ApiObject = ApiPlan["objects"][number];

/** The selected objects, with what's attached to them. */
function selectedObjects(doc: ApiPlan, selection: ReadonlySet<string>): ApiObject[] {
  return doc.objects.filter(
    (o) =>
      selection.has(o.id) ||
      (o.attached_to !== null && o.attached_to !== undefined && selection.has(o.attached_to)),
  );
}

/** The selection's outline: what the default spacing and the mirror axis come from. */
export function selectionBox(doc: ApiPlan, selection: ReadonlySet<string>) {
  const objects = selectedObjects(doc, selection);
  if (!objects.length) return null;
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const o of objects) {
    const item = doc.catalog[o.catalog_item_rev_id];
    if (!item) continue;
    const quarter = Math.round(o.rotation_ddeg / 900) % 2 === 1; // turned sideways
    const w = (quarter ? item.depth_mm : item.width_mm) / 2;
    const d = (quarter ? item.width_mm : item.depth_mm) / 2;
    minX = Math.min(minX, o.position[0] - w);
    maxX = Math.max(maxX, o.position[0] + w);
    minY = Math.min(minY, o.position[1] - d);
    maxY = Math.max(maxY, o.position[1] + d);
  }
  return { width: Math.round(maxX - minX), depth: Math.round(maxY - minY), cy: (minY + maxY) / 2 };
}

/** Where every copy goes (the originals at row 0, column 0 aren't included). */
export function arrayLayout(
  doc: ApiPlan,
  selection: ReadonlySet<string>,
  spec: ArraySpec,
): ArrayCopy[] {
  const objects = selectedObjects(doc, selection);
  const box = selectionBox(doc, selection);
  if (!box || spec.rows < 1 || spec.columns < 1) return [];
  const copies: ArrayCopy[] = [];
  for (let r = 0; r < spec.rows; r++) {
    for (let c = 0; c < spec.columns; c++) {
      if (r === 0 && c === 0) continue;
      const flip = spec.mirror && r % 2 === 1;
      for (const o of objects) {
        const y = flip ? 2 * box.cy - o.position[1] : o.position[1];
        copies.push({
          sourceId: o.id,
          position: [Math.round(o.position[0] + c * spec.dx), Math.round(y + r * spec.dy)],
          rotation_ddeg: flip ? (o.rotation_ddeg + 1800) % 3600 : o.rotation_ddeg,
        });
      }
    }
  }
  return copies;
}

/** The operations that add the copies, and their ids (to select them). */
export function arrayOps(
  doc: ApiPlan,
  selection: ReadonlySet<string>,
  spec: ArraySpec,
): { ops: Op[]; ids: string[] } {
  const objects = new Map(selectedObjects(doc, selection).map((o) => [o.id, o]));
  const layout = arrayLayout(doc, selection, spec);
  const perCopy = objects.size;
  const ops: Op[] = [];
  const ids: string[] = [];
  // Each copy of the group gets its own new ids; attachments point at their copied host.
  for (let i = 0; i < layout.length; i += perCopy) {
    const group = layout.slice(i, i + perCopy);
    const newIds = new Map(group.map((g) => [g.sourceId, newId()]));
    // Hosts before what's attached to them.
    const ordered = [...group].sort(
      (a, b) =>
        Number(Boolean(objects.get(a.sourceId)!.attached_to)) -
        Number(Boolean(objects.get(b.sourceId)!.attached_to)),
    );
    for (const g of ordered) {
      const o = objects.get(g.sourceId)!;
      const id = newIds.get(g.sourceId)!;
      ids.push(id);
      ops.push({
        op: "add",
        kind: "object",
        id,
        data: {
          catalog_item_rev_id: o.catalog_item_rev_id,
          position: [g.position[0], g.position[1], o.position[2]],
          rotation_ddeg: g.rotation_ddeg,
          label: null,
          attached_to: o.attached_to ? (newIds.get(o.attached_to) ?? null) : null,
          device_id: null,
          allocation_mode: o.allocation_mode ?? null,
        },
      });
    }
  }
  return { ops, ids };
}
