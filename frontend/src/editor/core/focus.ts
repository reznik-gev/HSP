/**
 * Bringing an element into view (docs/0090): its bounds, and a viewport that shows it with its
 * neighbours around it, never zoomed in closer than a desk's width fills the screen.
 */
import { boundsOf, type Rect, rotatedRectCorners } from "./geometry";
import type { Plan, Vec2 } from "./plan";
import { fitRect, type Viewport } from "./viewport";

/** The closest zoom a problem jumps to: about 8 mm per pixel. */
const CLOSEST_MM_PER_PX = 8;

export function elementBounds(plan: Plan, id: string): Rect | null {
  const wall = plan.walls.find((w) => w.id === id);
  if (wall) return boundsOf([wall.a, wall.b], wall.thickness_mm);
  const opening = plan.openings.find((o) => o.id === id);
  if (opening) {
    const w = plan.walls.find((x) => x.id === opening.wall_id);
    if (!w) return null;
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1;
    const at = (d: number): Vec2 => [
      w.a[0] + ((w.b[0] - w.a[0]) / len) * d,
      w.a[1] + ((w.b[1] - w.a[1]) / len) * d,
    ];
    return boundsOf([at(opening.offset_mm), at(opening.offset_mm + opening.width_mm)], 500);
  }
  const column = plan.columns?.find((c) => c.id === id);
  if (column) return boundsOf(column.footprint);
  const zone = plan.zones.find((z) => z.id === id);
  if (zone) return boundsOf(zone.boundary);
  const obj = plan.objects[id];
  const item = obj && plan.catalog[obj.catalog_item_rev_id];
  if (obj && item) {
    const c: Vec2 = [obj.position[0], obj.position[1]];
    return boundsOf(rotatedRectCorners(c, item.width_mm, item.depth_mm, obj.rotation_ddeg));
  }
  return null;
}

/** A viewport showing the element with room around it, or null if it isn't on the plan. */
export function viewportFor(plan: Plan, id: string, size: Vec2): Viewport | null {
  const bounds = elementBounds(plan, id);
  if (!bounds) return null;
  const fit = fitRect(bounds, size, Math.min(size[0], size[1]) / 4);
  return { ...fit, mmPerPx: Math.max(fit.mmPerPx, CLOSEST_MM_PER_PX) };
}
