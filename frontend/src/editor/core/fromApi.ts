/**
 * Convert a floor plan as the API returns it (docs/0036) into the editor's plan model.
 * Type-only import from the API schema: the core stays free of view and network code (docs/0052).
 */
import type { components } from "@/api/schema";

import { boundsOf, type Rect } from "./geometry";
import { stackingOrder } from "./heights";
import type { CatalogItem, Plan, Vec2 } from "./plan";

type ApiPlan = components["schemas"]["Plan"];

/** Fallback fills when a catalog item has no colour of its own. */
const CATEGORY_COLORS: Record<string, string> = {
  desk: "#e7e2d9",
  table: "#e7e2d9",
  chair: "#c9ccd1",
  monitor: "#4b5563",
  storage: "#d6d3d1",
  decor: "#b7d3b0",
};

export function planFromApi(
  api: ApiPlan,
  zoneTypes: ReadonlyMap<string, { name: string; color: string | null }>,
): Plan {
  const catalog: Record<string, CatalogItem> = {};
  for (const [id, c] of Object.entries(api.catalog)) {
    catalog[id] = {
      id,
      key: c.key,
      category: c.category,
      shape: c.shape,
      width_mm: c.width_mm,
      depth_mm: c.depth_mm,
      height_mm: c.height_mm,
      color: c.color ?? CATEGORY_COLORS[c.category] ?? "#d6d3d1",
      is_seat: c.is_seat,
    };
  }
  // Draw order (docs/0095): by the height things stand at, so attached items (monitors) and
  // raised ones (shelves) are drawn, and clicked, above what's below them.
  const order = stackingOrder(api.objects, (rev) => api.catalog[rev]?.height_mm ?? 0);
  return {
    walls: api.walls.map((w) => ({ ...w, a: w.a, b: w.b })),
    openings: api.openings,
    columns: api.columns.map((c) => ({ id: c.id, footprint: c.footprint })),
    zones: api.zones.map((z) => {
      const type = zoneTypes.get(z.zone_type_id);
      return {
        id: z.id,
        name: z.name,
        zone_type: type?.name ?? "",
        zone_type_id: z.zone_type_id,
        parent_zone_id: z.parent_zone_id ?? null,
        color: type?.color ?? "#cbd5e1",
        boundary: z.boundary,
      };
    }),
    objects: Object.fromEntries(
      api.objects.map((o) => [
        o.id,
        {
          id: o.id,
          catalog_item_rev_id: o.catalog_item_rev_id,
          position: o.position,
          rotation_ddeg: o.rotation_ddeg,
          label: o.label ?? null,
          attached_to: o.attached_to ?? null,
          allocation_mode: o.allocation_mode ?? null,
        },
      ]),
    ),
    objectOrder: order,
    catalog,
  };
}

/** Everything drawn on the floor, for "fit to screen". */
export function planBounds(plan: Plan): Rect | null {
  const points: Vec2[] = [
    ...plan.walls.flatMap((w) => [w.a, w.b]),
    ...plan.zones.flatMap((z) => z.boundary),
    ...(plan.columns ?? []).flatMap((c) => c.footprint),
    ...plan.objectOrder.flatMap((id) => {
      const o = plan.objects[id];
      return o ? [[o.position[0], o.position[1]] as Vec2] : [];
    }),
  ];
  return points.length ? boundsOf(points, 500) : null;
}

/** Seats are objects whose catalog item is a seat (docs/0021). */
export function isSeat(plan: Plan, id: string): boolean {
  const o = plan.objects[id];
  return Boolean(o && plan.catalog[o.catalog_item_rev_id]?.is_seat);
}
