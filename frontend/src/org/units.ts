/** Org units for pickers and labels (docs/0006, docs/0084): the whole tree, in tree order. */
import { queryOptions } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { components } from "@/api/schema";

export type Unit = components["schemas"]["UnitOut"];
export type Position = components["schemas"]["PositionOut"];

export interface UnitNode {
  unit: Unit;
  depth: number;
}

export const unitsQuery = queryOptions({
  queryKey: ["org-units"],
  queryFn: async (): Promise<Unit[]> => {
    const units: Unit[] = [];
    let cursor: string | undefined;
    do {
      const { data } = await api.GET("/api/v1/org-units", {
        params: { query: { limit: 500, cursor } },
      });
      if (!data) throw new Error("Couldn't load teams");
      units.push(...data.items);
      cursor = data.next_cursor ?? undefined;
    } while (cursor);
    return units;
  },
});

export const positionsQuery = (unitId: string) =>
  queryOptions({
    queryKey: ["positions", unitId],
    queryFn: async (): Promise<Position[]> => {
      const { data } = await api.GET("/api/v1/org-units/{unit_id}/positions", {
        params: { path: { unit_id: unitId } },
      });
      if (!data) throw new Error("Couldn't load positions");
      return data.items;
    },
  });

/** Depth-first, siblings by name: the order a tree reads in. */
export function treeOrder(units: readonly Unit[], collator?: Intl.Collator): UnitNode[] {
  const compare = collator ?? new Intl.Collator();
  const children = new Map<string | null, Unit[]>();
  for (const u of units) {
    const list = children.get(u.parent_id) ?? [];
    list.push(u);
    children.set(u.parent_id, list);
  }
  const out: UnitNode[] = [];
  const walk = (parent: string | null, depth: number) => {
    const list = [...(children.get(parent) ?? [])].sort((a, b) => compare.compare(a.name, b.name));
    for (const u of list) {
      out.push({ unit: u, depth });
      walk(u.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
