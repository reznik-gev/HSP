/**
 * Data for the read-only floor plan (docs/0087): the floor and where it is, its published plan,
 * zone colours and who holds each seat.
 */
import { queryOptions } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { components } from "@/api/schema";
import type { SeatState } from "@/editor/view-svg/PlanView";
import type { Plan } from "@/editor/core/plan";

export type Seat = components["schemas"]["SeatOut"];
type Floor = components["schemas"]["FloorOut"];
type ApiPlan = components["schemas"]["Plan"];

function fail(what: string): never {
  throw new Error(`Couldn't load ${what}`);
}

export interface FloorPlace {
  floor: Floor;
  building: { id: string; name: string; code: string };
  site: { id: string; name: string };
}

export const floorPlaceQuery = (floorId: string) =>
  queryOptions({
    queryKey: ["floor-place", floorId],
    queryFn: async (): Promise<FloorPlace> => {
      const floor = await api.GET("/api/v1/floors/{floor_id}", {
        params: { path: { floor_id: floorId } },
      });
      if (!floor.data) return fail("the floor");
      const building = await api.GET("/api/v1/buildings/{building_id}", {
        params: { path: { building_id: floor.data.building_id } },
      });
      if (!building.data) return fail("the building");
      const site = await api.GET("/api/v1/sites/{site_id}", {
        params: { path: { site_id: building.data.site_id } },
      });
      if (!site.data) return fail("the site");
      return { floor: floor.data, building: building.data, site: site.data };
    },
  });

export const publishedPlanQuery = (floorId: string, version: number) =>
  queryOptions({
    queryKey: ["plan", floorId, version],
    queryFn: async (): Promise<ApiPlan> => {
      const { data } = await api.GET("/api/v1/floors/{floor_id}/versions/{version}", {
        params: { path: { floor_id: floorId, version } },
      });
      // openapi-fetch widens the schema's [x, y] pairs to number[][]; the JSON is the same.
      return (data as ApiPlan | undefined) ?? fail("the plan");
    },
    staleTime: Infinity, // a published version never changes (docs/0028)
  });

export const zoneTypesQuery = queryOptions({
  queryKey: ["zone-types"],
  queryFn: async () => {
    const { data } = await api.GET("/api/v1/zone-types");
    if (!data) return fail("zone types");
    return new Map(data.items.map((z) => [z.id, { name: z.name, color: z.color }]));
  },
  staleTime: 10 * 60_000,
});

/** Every seat on the floor with its holder, following cursors (docs/0040). */
export const floorSeatsQuery = (floorId: string) =>
  queryOptions({
    queryKey: ["seats", "floor", floorId],
    queryFn: async (): Promise<Map<string, Seat>> => {
      const seats = new Map<string, Seat>();
      let cursor: string | undefined;
      do {
        const { data } = await api.GET("/api/v1/seats", {
          params: { query: { floor_id: floorId, limit: 500, cursor } },
        });
        if (!data) return fail("seats");
        for (const s of data.items) seats.set(s.id, s);
        cursor = data.next_cursor ?? undefined;
      } while (cursor);
      return seats;
    },
  });

/**
 * Seat labels used on the building's other floors (published), which seat numbering skips:
 * labels are unique per building (docs/0034, docs/0049).
 */
export const buildingLabelsQuery = (buildingId: string, exceptFloorId: string) =>
  queryOptions({
    queryKey: ["seats", "building-labels", buildingId, exceptFloorId],
    queryFn: async (): Promise<Set<string>> => {
      const labels = new Set<string>();
      let cursor: string | undefined;
      do {
        const { data } = await api.GET("/api/v1/seats", {
          params: { query: { building_id: buildingId, limit: 500, cursor } },
        });
        if (!data) return fail("seats");
        for (const s of data.items)
          if (s.label && s.floor.id !== exceptFloorId) labels.add(s.label);
        cursor = data.next_cursor ?? undefined;
      } while (cursor);
      return labels;
    },
  });

/** Seat id -> the state the viewer colours (docs/0087 choice 11). */
export function seatStates(plan: Plan, seats: ReadonlyMap<string, Seat>): Map<string, SeatState> {
  const states = new Map<string, SeatState>();
  for (const id of plan.objectOrder) {
    const obj = plan.objects[id];
    if (!obj || !plan.catalog[obj.catalog_item_rev_id]?.is_seat) continue;
    const seat = seats.get(id);
    if (obj.allocation_mode === "bookable") states.set(id, "bookable");
    else if (obj.allocation_mode === "unavailable") states.set(id, "unavailable");
    else if (seat?.holder_person) states.set(id, "person");
    else if (seat?.holder_unit) states.set(id, "unit");
    else states.set(id, "free");
  }
  return states;
}
