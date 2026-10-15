/**
 * Opens the loaded plan in the editor store and keeps it saved (docs/0089 choice 3). Every
 * time a fresh copy of the plan is loaded (on open, or after a reload) the history starts over
 * and a new autosave takes over.
 */
import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import type { Problem } from "@/api/problems";
import type { EditorStore, PendingChange, ZoneTypes } from "@/editor/core/store";

import { Autosave, type SaveState } from "./autosave";
import type { EditorPlan } from "./editorPlan";

const IDLE = createStore<SaveState>()(() => ({ status: "saved", version: null }));

export interface EditSessionEvents {
  /** Load the draft again: it changed elsewhere. */
  onStale(): void;
  /** The server refused a change; it has been taken back already. */
  onRejected(problem: Problem | null, change: PendingChange): void;
  onLockLost(): void;
}

export function useEditSession(
  store: EditorStore,
  floorId: string,
  editorPlan: EditorPlan | undefined,
  zoneTypes: ZoneTypes | undefined,
  /** Whether we hold the edit lock; saving waits while we don't. */
  held: boolean,
  events: EditSessionEvents,
) {
  const [session] = useState(() =>
    createStore<{ autosave: Autosave | null }>(() => ({ autosave: null })),
  );
  const autosave = useStore(session, (s) => s.autosave);
  const save = useStore(autosave?.state ?? IDLE);

  useEffect(() => {
    if (!editorPlan || !zoneTypes) return;
    const { plan, source } = editorPlan;
    store.getState().loadDocument(plan, zoneTypes);
    const next = new Autosave(
      store,
      floorId,
      // Without a draft the first changeset creates one (docs/0081).
      source === "draft"
        ? { revision: plan.revision, version: plan.version }
        : { revision: 0, version: null },
      {
        onStale: () => events.onStale(),
        onRejected: (problem, change) => events.onRejected(problem, change),
        onLockLost: () => events.onLockLost(),
      },
    );
    session.setState({ autosave: next });
    return () => next.stop();
    // `events` is recreated on every render; only a new plan starts a new session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, floorId, editorPlan, zoneTypes, session]);

  useEffect(() => {
    if (held) autosave?.resume();
    else autosave?.pause();
  }, [autosave, held]);

  // Closing the tab with changes still on their way asks first.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (store.getState().pending.length || autosave?.state.getState().status === "saving") {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [store, autosave]);

  return { autosave, save };
}
