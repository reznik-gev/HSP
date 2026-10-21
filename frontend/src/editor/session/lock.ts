/**
 * The floor's edit lock (docs/0016, docs/0089): only one person edits a floor at a time.
 * Opening the editor takes the lock, a heartbeat keeps it every minute, and leaving releases
 * it. If the heartbeat is refused (someone took over), editing stops. A missed heartbeat on a
 * flaky network is simply retried: the lock lasts 15 minutes on the server.
 */
import { queryOptions } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/api/client";

export const HEARTBEAT_MS = 60_000;

export type LockState =
  | { kind: "acquiring" }
  | { kind: "held" }
  /** Someone else is editing. */
  | { kind: "busy"; holder: string | null; since: string | null }
  /** We held it, then lost it (taken over, or expired). */
  | { kind: "lost" }
  | { kind: "forbidden" }
  | { kind: "failed" };

export const lockStatusQuery = (floorId: string) =>
  queryOptions({
    queryKey: ["floor-lock", floorId],
    queryFn: async () => {
      const { data } = await api.GET("/api/v1/floors/{floor_id}/lock", {
        params: { path: { floor_id: floorId } },
      });
      if (!data) throw new Error("Couldn't load the edit lock");
      return data;
    },
    // Someone starting or stopping editing shows within 15 s (docs/0041).
    refetchInterval: 15_000,
  });

/** Removes whoever holds the lock; their draft is kept (admins only, audited). */
export async function forceRelease(floorId: string): Promise<boolean> {
  const { response } = await api.POST("/api/v1/floors/{floor_id}/lock/force-release", {
    params: { path: { floor_id: floorId } },
  });
  return response.ok;
}

function release(floorId: string): void {
  // keepalive lets the request finish when the tab is closing.
  void api
    .DELETE("/api/v1/floors/{floor_id}/lock", {
      params: { path: { floor_id: floorId } },
      keepalive: true,
    })
    .catch(() => undefined); // unreachable server: the lock expires by itself
}

async function acquire(floorId: string): Promise<LockState> {
  const path = { params: { path: { floor_id: floorId } } };
  try {
    const { data, response } = await api.POST("/api/v1/floors/{floor_id}/lock", path);
    if (data) return { kind: "held" };
    if (response.status === 403) return { kind: "forbidden" };
    if (response.status === 423) {
      const status = await api.GET("/api/v1/floors/{floor_id}/lock", path);
      return {
        kind: "busy",
        holder: status.data?.holder_name ?? null,
        since: status.data?.acquired_at ?? null,
      };
    }
  } catch {
    // unreachable server: reported as failed below
  }
  return { kind: "failed" };
}

export function useEditLock(floorId: string) {
  const [state, setState] = useState<LockState>({ kind: "acquiring" });
  // Each attempt (opening, Retry, Take over) acquires once.
  const [attempt, setAttempt] = useState(0);
  const held = state.kind === "held";
  const heldRef = useRef(false);

  useEffect(() => {
    let current = true;
    void acquire(floorId).then((next) => current && setState(next));
    return () => {
      current = false;
    };
  }, [floorId, attempt]);

  useEffect(() => {
    heldRef.current = held;
    if (!held) return;
    const timer = setInterval(() => {
      api
        .POST("/api/v1/floors/{floor_id}/lock", { params: { path: { floor_id: floorId } } })
        .then(({ response }) => {
          if (response.status === 423 || response.status === 409) setState({ kind: "lost" });
        })
        .catch(() => undefined); // retried on the next beat
    }, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [held, floorId]);

  // Leaving the page (Exit, navigation or closing the tab) releases the lock.
  useEffect(() => {
    const onHide = () => heldRef.current && release(floorId);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      if (heldRef.current) release(floorId);
    };
  }, [floorId]);

  const retry = useCallback(() => {
    setState({ kind: "acquiring" });
    setAttempt((n) => n + 1);
  }, []);

  const takeOver = useCallback(() => {
    setState({ kind: "acquiring" });
    void forceRelease(floorId).then((ok) =>
      ok ? setAttempt((n) => n + 1) : setState({ kind: "failed" }),
    );
  }, [floorId]);

  /** Autosave found out first (a save was refused for the lock). */
  const markLost = useCallback(() => setState({ kind: "lost" }), []);

  return { state, retry, takeOver, markLost };
}
