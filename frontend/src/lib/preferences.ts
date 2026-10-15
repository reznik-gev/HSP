/**
 * The user's saved preferences (docs/0046, docs/0087): language, theme and display units, kept
 * on the server so they follow the user to any computer. `null` means "not chosen": the browser
 * language and the system theme stay in charge until the user picks something.
 */
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { api } from "@/api/client";
import type { components } from "@/api/schema";
import i18n from "@/i18n";

import { useTheme } from "./theme";

export type Preferences = components["schemas"]["Preferences"];

const NONE: Preferences = { language: null, theme: null, display_units: null, grid_mm: null };

export const preferencesQuery = queryOptions({
  queryKey: ["preferences"],
  queryFn: async (): Promise<Preferences> => {
    const { data, error } = await api.GET("/api/v1/me/preferences");
    if (error || !data) throw new Error("Couldn't load preferences");
    return { ...NONE, ...data };
  },
  staleTime: Infinity, // only this user changes them, through useSavePreference
});

/** Apply the saved choices once they arrive. Mounted once, inside the signed-in app. */
export function useApplyPreferences(): void {
  const { data } = useQuery(preferencesQuery);
  useEffect(() => {
    if (data?.language && data.language !== i18n.resolvedLanguage) {
      void i18n.changeLanguage(data.language);
    }
    if (data?.theme) useTheme.setState({ choice: data.theme });
  }, [data]);
}

/** Save one or more preferences; the screen has already changed, so this is fire-and-forget. */
export function useSavePreference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (change: Partial<Preferences>) => {
      const next = { ...(queryClient.getQueryData(preferencesQuery.queryKey) ?? NONE), ...change };
      queryClient.setQueryData(preferencesQuery.queryKey, next);
      const { data, error } = await api.PUT("/api/v1/me/preferences", { body: next });
      if (error || !data) throw new Error("Couldn't save preferences");
      return data;
    },
  });
}
