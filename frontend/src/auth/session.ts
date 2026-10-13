/**
 * Who is signed in (docs/0038, docs/0087). The backend is a BFF: login, callback and logout are
 * plain page navigations, and the browser holds only an HttpOnly session cookie. `/auth/me`
 * answers 401 when nobody is signed in.
 */
import { queryOptions } from "@tanstack/react-query";

import { api, setCsrfToken } from "@/api/client";
import type { components } from "@/api/schema";

export type Me = components["schemas"]["Me"];

/** Full-page navigation, swappable in tests (jsdom can't navigate). */
export const navigation = {
  assign(url: string): void {
    window.location.assign(url);
  },
};

export function loginUrl(next: string): string {
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

export function currentPath(): string {
  return window.location.pathname + window.location.search;
}

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async (): Promise<Me | null> => {
    const { data, response } = await api.GET("/api/v1/auth/me");
    if (response.status === 401) {
      setCsrfToken(null);
      return null; // signed out
    }
    if (!data) throw new Error(`/auth/me answered ${response.status}`);
    setCsrfToken(data.csrf_token);
    return data;
  },
  staleTime: 5 * 60_000,
  retry: 1,
});

/** End the HSP session, then the Keycloak one, so the next visit asks for a password again. */
export async function signOut(): Promise<void> {
  const { data } = await api.POST("/api/v1/auth/logout");
  setCsrfToken(null);
  navigation.assign(data?.logout_url ?? "/");
}

export function initials(me: Me): string {
  const source = me.name?.trim() || me.email || me.subject;
  const parts = source.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [source];
  return letters
    .map((p) => p?.[0] ?? "")
    .join("")
    .toUpperCase();
}
