/**
 * Admin-only UI (docs/0027, docs/0088 choice 2): viewers never see admin buttons or areas.
 * This is presentation only; the server refuses non-admin writes anyway.
 */
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { meQuery } from "./session";

export function useIsAdmin(): boolean {
  const { data } = useQuery(meQuery);
  return data?.is_admin ?? false;
}

export function AdminOnly({ children }: { children: ReactNode }) {
  return useIsAdmin() ? children : null;
}
