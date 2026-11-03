/** Sites, a site's buildings and a building's floors: for lists and site → building → floor pickers. */
import { queryOptions } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { components } from "@/api/schema";

type Site = components["schemas"]["SiteOut"];

export const sitesQuery = queryOptions({
  queryKey: ["sites"],
  queryFn: async (): Promise<Site[]> => {
    const { data, error } = await api.GET("/api/v1/sites", { params: { query: { limit: 500 } } });
    if (error || !data) throw new Error("Couldn't load sites");
    return data.items;
  },
});

export const buildingsQuery = (siteId: string) =>
  queryOptions({
    queryKey: ["buildings", siteId],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/buildings", {
        params: { query: { site_id: siteId, limit: 500 } },
      });
      if (error || !data) throw new Error("Couldn't load buildings");
      return data.items;
    },
  });

export const floorsQuery = (buildingId: string) =>
  queryOptions({
    queryKey: ["floors", buildingId],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/floors", {
        params: { query: { building_id: buildingId, limit: 500 } },
      });
      if (error || !data) throw new Error("Couldn't load floors");
      return data.items;
    },
  });
