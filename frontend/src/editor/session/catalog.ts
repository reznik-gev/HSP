/**
 * The catalog for placing items (docs/0021, docs/0083): every active item, built-in and the
 * organisation's own, as the plan carries it (the item's current revision).
 */
import { queryOptions } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { PlanCatalogItem } from "@/editor/core/edits";

export const catalogQuery = queryOptions({
  queryKey: ["catalog-items"],
  queryFn: async (): Promise<PlanCatalogItem[]> => {
    const items: PlanCatalogItem[] = [];
    let cursor: string | undefined;
    do {
      const { data } = await api.GET("/api/v1/catalog-items", {
        params: { query: { limit: 200, cursor } },
      });
      if (!data) throw new Error("Couldn't load the catalog");
      for (const item of data.items) {
        const rev = item.current_revision;
        items.push({
          id: rev.id,
          item_id: item.id,
          key: item.key,
          category: item.category,
          name: item.name,
          shape: rev.shape as PlanCatalogItem["shape"],
          width_mm: rev.width_mm,
          depth_mm: rev.depth_mm,
          height_mm: rev.height_mm,
          color: rev.color ?? null,
          is_seat: rev.is_seat,
          mountable: rev.mountable,
          attaches_to_categories: rev.attaches_to_categories,
          footprint_blocks: rev.footprint_blocks,
        });
      }
      cursor = data.next_cursor ?? undefined;
    } while (cursor);
    return items;
  },
  staleTime: 5 * 60_000,
});
