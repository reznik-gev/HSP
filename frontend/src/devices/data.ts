/** Devices (docs/0022, docs/0083, docs/0095): the list with its filters, and one device. */
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { components } from "@/api/schema";

export type Device = components["schemas"]["DeviceOut"];

export interface DeviceFilters {
  q?: string;
  placed?: boolean;
  issued?: boolean;
}

export const devicesQuery = (f: DeviceFilters) =>
  infiniteQueryOptions({
    queryKey: ["devices", "list", f],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.GET("/api/v1/devices", {
        params: {
          query: { q: f.q, placed: f.placed, issued: f.issued, limit: 50, cursor: pageParam },
        },
      });
      if (!data) throw new Error("Couldn't load devices");
      return data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

export const deviceQuery = (id: string) =>
  queryOptions({
    queryKey: ["devices", "one", id],
    queryFn: async (): Promise<Device> => {
      const { data } = await api.GET("/api/v1/devices/{device_id}", {
        params: { path: { device_id: id } },
      });
      if (!data) throw new Error("Couldn't load the device");
      return data;
    },
  });
