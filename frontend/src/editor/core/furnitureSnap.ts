/**
 * Where an item lands when placed or dragged (docs/0047, docs/0092 step 2):
 *
 * - **Attach snap:** an item that can sit on others (`attaches_to_categories`, docs/0021, e.g.
 *   a docking station on a desk) over a compatible host lands on it, turned like the host,
 *   and is attached to it. It keeps z = 0: built-in attachables aren't mountable, and the 3D
 *   view puts attached items on their host.
 * - **Face snap:** an item whose back comes within a few screen pixels of a wall face sits
 *   flush against it, back to the wall and facing away (e.g. a desk against a wall), sliding
 *   along the wall in grid steps.
 * - Otherwise the grid. Holding Alt turns all of it off.
 *
 * An item's back is its local −y side: at rotation 0 it faces +y (plan north).
 */
import { alongSegment, pointInRotatedRect } from "./geometry";
import type { Plan, Vec2 } from "./plan";
import { SNAP_PX, type SnapOptions } from "./snap";

export interface ItemShape {
  width_mm: number;
  depth_mm: number;
  attaches_to_categories?: readonly string[];
}

export interface ItemPlacement {
  at: Vec2;
  rotation_ddeg: number;
  /** The host it sits on (attach snap), or null. */
  attachedTo: string | null;
  snap: "face" | "attach" | "grid" | null;
}

const ddeg = (radians: number) => {
  const d = Math.round((radians * 1800) / Math.PI);
  return ((d % 3600) + 3600) % 3600;
};

export function placeItem(
  plan: Plan,
  item: ItemShape,
  p: Vec2,
  rotation: number,
  opts: SnapOptions & {
    /** Objects that can't be hosts: the item itself and what moves with it. */
    ignoreIds?: ReadonlySet<string>;
  },
): ItemPlacement {
  const round = (q: Vec2): Vec2 => [Math.round(q[0]), Math.round(q[1])];
  if (opts.free) return { at: round(p), rotation_ddeg: rotation, attachedTo: null, snap: null };

  // Attach snap: a compatible host under the pointer; the topmost wins.
  const hosts = new Set(item.attaches_to_categories ?? []);
  if (hosts.size) {
    for (const id of [...plan.objectOrder].reverse()) {
      const o = plan.objects[id];
      if (!o || o.attached_to || opts.ignoreIds?.has(id)) continue;
      const host = plan.catalog[o.catalog_item_rev_id];
      if (!host || !hosts.has(host.category)) continue;
      const c: Vec2 = [o.position[0], o.position[1]];
      if (pointInRotatedRect(p, c, host.width_mm, host.depth_mm, o.rotation_ddeg)) {
        return { at: round(p), rotation_ddeg: o.rotation_ddeg, attachedTo: id, snap: "attach" };
      }
    }
  }

  // Face snap: the nearest wall face within reach of where the item's back would be.
  const reach = SNAP_PX * opts.mmPerPx;
  let best: { at: Vec2; rotation: number; gap: number } | null = null;
  for (const w of plan.walls) {
    const { along, length } = alongSegment(p, w.a, w.b);
    if (length === 0 || along < 0 || along > length) continue;
    const ux = (w.b[0] - w.a[0]) / length;
    const uy = (w.b[1] - w.a[1]) / length;
    const foot: Vec2 = [w.a[0] + ux * along, w.a[1] + uy * along];
    const side = (p[0] - foot[0]) * -uy + (p[1] - foot[1]) * ux >= 0 ? 1 : -1;
    // The normal pointing from the wall towards the pointer: the way the item faces.
    const nx = -uy * side;
    const ny = ux * side;
    const distance = Math.hypot(p[0] - foot[0], p[1] - foot[1]);
    const gap = distance - (w.thickness_mm / 2 + item.depth_mm / 2);
    if (Math.abs(gap) > reach || (best && Math.abs(gap) >= best.gap)) {
      continue;
    }
    const step = opts.gridSnap ? opts.gridMm : 1;
    const slide = Math.round(along / step) * step;
    const offset = w.thickness_mm / 2 + item.depth_mm / 2;
    best = {
      at: round([w.a[0] + ux * slide + nx * offset, w.a[1] + uy * slide + ny * offset]),
      rotation: ddeg(Math.atan2(ny, nx) - Math.PI / 2),
      gap: Math.abs(gap),
    };
  }
  if (best) {
    return { at: best.at, rotation_ddeg: best.rotation, attachedTo: null, snap: "face" };
  }

  if (opts.gridSnap) {
    const g = opts.gridMm;
    return {
      at: [Math.round(p[0] / g) * g, Math.round(p[1] / g) * g],
      rotation_ddeg: rotation,
      attachedTo: null,
      snap: "grid",
    };
  }
  return { at: round(p), rotation_ddeg: rotation, attachedTo: null, snap: null };
}
