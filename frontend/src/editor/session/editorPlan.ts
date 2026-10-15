/**
 * What the editor opens (docs/0081, docs/0089): the floor's draft if there is one, otherwise a
 * copy of the published plan, otherwise an empty plan. The first saved change creates the draft.
 */
import { queryOptions } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { components } from "@/api/schema";

type ApiPlan = components["schemas"]["Plan"];

export type EditorPlanSource = "draft" | "published" | "new";

export interface EditorPlan {
  plan: ApiPlan;
  source: EditorPlanSource;
}

export function emptyPlan(floorId: string): ApiPlan {
  return {
    floor_id: floorId,
    version: 1,
    state: "draft",
    revision: 0,
    walls: [],
    openings: [],
    columns: [],
    zones: [],
    objects: [],
    catalog: {},
  };
}

export const editorPlanQuery = (floorId: string, publishedVersion: number | null) =>
  queryOptions({
    queryKey: ["editor-plan", floorId],
    queryFn: async (): Promise<EditorPlan> => {
      const draft = await api.GET("/api/v1/floors/{floor_id}/draft", {
        params: { path: { floor_id: floorId } },
      });
      // openapi-fetch widens the schema's [x, y] pairs to number[][]; the JSON is the same.
      if (draft.data) return { plan: draft.data as ApiPlan, source: "draft" };
      if (draft.response.status !== 404) throw new Error("Couldn't load the draft");
      if (!publishedVersion) return { plan: emptyPlan(floorId), source: "new" };
      const published = await api.GET("/api/v1/floors/{floor_id}/versions/{version}", {
        params: { path: { floor_id: floorId, version: publishedVersion } },
      });
      if (!published.data) throw new Error("Couldn't load the published plan");
      return { plan: published.data as ApiPlan, source: "published" };
    },
    // Always read fresh when the editor opens: someone may have published or discarded.
    gcTime: 0,
  });
