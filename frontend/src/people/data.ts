/** People data (docs/0084, docs/0088): the list, and a person's seats and devices. */
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { components } from "@/api/schema";

export type Person = components["schemas"]["PersonOut"];
export type FreedSeat = components["schemas"]["FreedSeat"];

export interface PeopleFilters {
  q?: string;
  unit?: string;
  inactive?: boolean;
  unseated?: boolean;
}

export const peopleQuery = (f: PeopleFilters) =>
  infiniteQueryOptions({
    queryKey: ["people", f],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.GET("/api/v1/people", {
        params: {
          query: {
            q: f.q,
            unit_id: f.unit,
            include_inactive: f.inactive ?? false,
            seated: f.unseated ? false : undefined,
            limit: 50,
            cursor: pageParam,
          },
        },
      });
      if (!data) throw new Error("Couldn't load people");
      return data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

export const personQuery = (id: string) =>
  queryOptions({
    queryKey: ["person", id],
    queryFn: async (): Promise<Person> => {
      const { data } = await api.GET("/api/v1/people/{person_id}", {
        params: { path: { person_id: id } },
      });
      if (!data) throw new Error("Couldn't load the person");
      return data;
    },
  });

export const personSeatsQuery = (id: string) =>
  queryOptions({
    queryKey: ["seats", "person", id],
    queryFn: async () => {
      const { data } = await api.GET("/api/v1/seats", {
        params: { query: { holder_person_id: id, limit: 100 } },
      });
      if (!data) throw new Error("Couldn't load seats");
      return data.items;
    },
  });

export const personDevicesQuery = (id: string) =>
  queryOptions({
    queryKey: ["devices", "person", id],
    queryFn: async () => {
      const { data } = await api.GET("/api/v1/devices", {
        params: { query: { assigned_person_id: id, limit: 100 } },
      });
      if (!data) throw new Error("Couldn't load devices");
      return data.items;
    },
  });

/**
 * Undo for a deactivation (docs/0088): reactivate, then give back each freed seat that is still
 * free. A seat given to someone else in the meantime is skipped, never taken back.
 */
export async function undoDeactivation(
  personId: string,
  freed: readonly FreedSeat[],
): Promise<{ restored: number; skipped: number }> {
  await api.POST("/api/v1/people/{person_id}/reactivate", {
    params: { path: { person_id: personId } },
  });
  let restored = 0;
  let skipped = 0;
  for (const seat of freed) {
    const { data } = await api.GET("/api/v1/seats/{seat_id}/assignment", {
      params: { path: { seat_id: seat.seat_id } },
    });
    if (!data || data.assignment) {
      skipped += 1;
      continue;
    }
    const { error } = await api.PUT("/api/v1/seats/{seat_id}/assignment", {
      params: { path: { seat_id: seat.seat_id } },
      body: { person_id: personId },
    });
    if (error) skipped += 1;
    else restored += 1;
  }
  return { restored, skipped };
}
