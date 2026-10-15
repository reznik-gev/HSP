/**
 * Catalog data for the Catalog screen (docs/0083, docs/0095): every item with its current
 * revision, built-in and the organisation's own, optionally with archived ones.
 */
import { queryOptions } from "@tanstack/react-query";
import type { TFunction } from "i18next";

import { api } from "@/api/client";
import { ApiProblem, asProblem, problemSlug } from "@/api/problems";
import type { components } from "@/api/schema";

export type CatalogItem = components["schemas"]["CatalogItemOut"];
export type Revision = components["schemas"]["RevisionOut"];

/** Every catalog item, following the pages; the catalog is small. */
export const catalogItemsQuery = (includeArchived: boolean) =>
  queryOptions({
    queryKey: ["catalog-items", "all", { includeArchived }],
    queryFn: async (): Promise<CatalogItem[]> => {
      const items: CatalogItem[] = [];
      let cursor: string | undefined;
      do {
        const { data } = await api.GET("/api/v1/catalog-items", {
          params: { query: { include_archived: includeArchived, limit: 200, cursor } },
        });
        if (!data) throw new Error("Couldn't load the catalog");
        items.push(...data.items);
        cursor = data.next_cursor ?? undefined;
      } while (cursor);
      return items;
    },
  });

/** A category's name: translated for the built-in ones, otherwise as typed, underscores as
 *  spaces (docs/0095). */
export function categoryName(t: TFunction, category: string): string {
  return t(`editor.categories.${category}`, { defaultValue: category.replaceAll("_", " ") });
}

/** Width × depth × height in centimetres, as the list shows sizes. */
export function sizeText(rev: Pick<Revision, "width_mm" | "depth_mm" | "height_mm">): string {
  const cm = (mm: number) => String(Math.round(mm) / 10);
  return `${cm(rev.width_mm)} × ${cm(rev.depth_mm)} × ${cm(rev.height_mm)}`;
}

/**
 * A custom copy of `item` (docs/0083: built-in items are read-only, so admins copy one). The
 * copy is named "… (copy)"; its key gets `_copy`, then `_copy_2`… if that's taken.
 */
export async function copyItem(item: CatalogItem, name: string): Promise<CatalogItem> {
  const rev = item.current_revision;
  for (let n = 1; n <= 20; n++) {
    const key = `${item.key}_copy${n === 1 ? "" : `_${n}`}`;
    const { data, error } = await api.POST("/api/v1/catalog-items", {
      body: {
        key,
        category: item.category,
        name,
        shape: rev.shape as "box" | "cylinder" | "l_shape",
        width_mm: rev.width_mm,
        depth_mm: rev.depth_mm,
        height_mm: rev.height_mm,
        color: rev.color,
        is_seat: rev.is_seat,
        mountable: rev.mountable,
        attaches_to_categories: rev.attaches_to_categories,
        footprint_blocks: rev.footprint_blocks,
      },
    });
    if (data) return data;
    if (problemSlug(asProblem(error)) !== "key-taken") throw new ApiProblem(asProblem(error));
  }
  throw new Error("No free key for the copy");
}
