/** Member counts per team, for the tree and the chart (docs/0088). */
import { queryOptions } from "@tanstack/react-query";

import { api } from "@/api/client";

/** Active people per team (direct members), counted from everyone's memberships. */
export const memberCountsQuery = queryOptions({
  queryKey: ["people", "member-counts"],
  queryFn: async (): Promise<Map<string, number>> => {
    const counts = new Map<string, number>();
    let cursor: string | undefined;
    do {
      const { data } = await api.GET("/api/v1/people", {
        params: { query: { limit: 500, cursor } },
      });
      if (!data) throw new Error("Couldn't count members");
      for (const p of data.items) {
        for (const m of p.memberships) counts.set(m.unit_id, (counts.get(m.unit_id) ?? 0) + 1);
      }
      cursor = data.next_cursor ?? undefined;
    } while (cursor);
    return counts;
  },
});
