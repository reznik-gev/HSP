/**
 * Heights on the 2D plan (docs/0094, docs/0095): which items are raised off the floor, the
 * height range a tag shows, and the order things stack in, so higher things are drawn (and
 * clicked) on top of lower ones.
 */
import type { CatalogItem, Opening } from "./plan";

/** What the height filter shows at full strength; the rest is faded. */
export type HeightFilter = "all" | "floor" | "raised";

interface Placed {
  /** x, y, z in mm. */
  position: readonly number[];
  attached_to?: string | null;
}

/** Height off the floor (z), in mm. */
const zOf = (obj: Placed): number => obj.position[2] ?? 0;

/** Raised: off the floor on its own (a wall-mounted screen, a shelf). Attached items sit on
 *  their host and count as part of it. */
export function isRaised(obj: Placed): boolean {
  return !obj.attached_to && zOf(obj) !== 0;
}

/** Metres with two decimals, as the tags show them: 1800 → "1.80". */
export function metres(mm: number): string {
  return (mm / 1000).toFixed(2);
}

/** "bottom–top" in metres. */
export function heightTag(bottom_mm: number, top_mm: number): string {
  return `${metres(bottom_mm)}–${metres(top_mm)}`;
}

export function itemTag(obj: Placed, item: Pick<CatalogItem, "height_mm">): string {
  return heightTag(zOf(obj), zOf(obj) + item.height_mm);
}

/** A window's sill to its top; doors have no tag. */
export function windowTag(opening: Opening): string | null {
  return opening.type === "window"
    ? heightTag(opening.sill_mm, opening.sill_mm + opening.height_mm)
    : null;
}

/**
 * Ids in drawing order, lowest first: items by the height they stand at. An attached item stands
 * on top of its host, and a raised one at its own height; everything else is at 0. Ties keep
 * their original order.
 */
export function stackingOrder<T extends Placed & { id: string; catalog_item_rev_id: string }>(
  objects: readonly T[],
  heightOf: (catalogItemRevId: string) => number,
): string[] {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const standsAt = (o: T): number => {
    if (o.attached_to) {
      const host = byId.get(o.attached_to);
      return host ? zOf(host) + heightOf(host.catalog_item_rev_id) : 0;
    }
    return zOf(o);
  };
  return objects
    .map((o, i) => ({ id: o.id, at: standsAt(o), i }))
    .sort((a, b) => a.at - b.at || a.i - b.i)
    .map((o) => o.id);
}
