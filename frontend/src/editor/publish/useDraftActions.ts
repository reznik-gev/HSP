/**
 * Publish, Discard draft and Restore from the editor's top bar (docs/0082, docs/0089, docs/0090).
 *
 * - Publishing goes back to the floor page, which then shows the new version.
 * - Discarding acts at once (docs/0086); the notice's Undo rebuilds the discarded draft on top of
 *   what's published, with the operations that turn one into the other.
 * - Publish conflicts (duplicate seat labels, a device on another floor) go to Problems.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "@/api/client";
import type { components } from "@/api/schema";
import { type Problem, problemMessage, problemSlug } from "@/api/problems";
import { diffOps, newId } from "@/editor/core/operations";
import type { EditorStore } from "@/editor/core/store";
import { notify, notifyError } from "@/lib/notify";

import type { Autosave } from "../session/autosave";

type PublishResult = components["schemas"]["PublishResult"];

export function useDraftActions({
  floorId,
  floorName,
  store,
  autosave,
  reload,
}: {
  floorId: string;
  floorName: string;
  store: EditorStore;
  autosave: Autosave | null;
  /** Loads the floor's draft (or published plan) into the editor again. */
  reload: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [publishing, setPublishing] = useState(false);
  const [history, setHistory] = useState(false);

  /** Everything else that shows this floor is out of date after a publish or restore. */
  const refreshFloor = () => {
    for (const key of [["floor-place", floorId], ["plan", floorId], ["seats"], ["seat-search"]]) {
      void client.invalidateQueries({ queryKey: key });
    }
  };

  const openPublish = async () => {
    await autosave?.flush();
    if (store.getState().pending.length) return notifyError(t("editor.unsavedPublish"));
    setPublishing(true);
  };

  const onPublished = (result: PublishResult) => {
    setPublishing(false);
    refreshFloor();
    notify(t("editor.publish.done", { floor: floorName, version: result.published_version }), {
      description: result.freed_seats.length
        ? t("people.seatsFreed", { count: result.freed_seats.length })
        : undefined,
    });
    void navigate({ to: "/floors/$floorId", params: { floorId } });
  };

  const onRefused = (problem: Problem | null) => {
    setPublishing(false);
    const slug = problemSlug(problem);
    if (slug === "publish-conflicts") {
      const s = store.getState();
      s.addProblems(
        (problem?.errors ?? []).map((e) => ({
          id: newId(),
          severity: "error",
          code: e.code,
          message: e.message,
          elementId: e.element_id ?? null,
        })),
      );
      s.setPanelTab("problems");
      notifyError(t("editor.publish.conflicts"));
    } else if (slug === "stale-revision") {
      notify(t("editor.reloaded"));
      void reload();
    } else {
      notifyError(problemMessage(problem, t("common.failed")));
    }
  };

  const discard = async () => {
    await autosave?.flush();
    const discarded = store.getState().document;
    const { response } = await api.DELETE("/api/v1/floors/{floor_id}/draft", {
      params: { path: { floor_id: floorId } },
    });
    if (!response.ok || !discarded) return notifyError(t("common.failed"));
    await reload();
    notify(t("editor.discarded"), {
      undo: async () => {
        const current = store.getState().document;
        const ops = current ? diffOps(current, discarded) : [];
        if (ops.length) {
          const { error } = await api.POST("/api/v1/floors/{floor_id}/draft/changesets", {
            params: { path: { floor_id: floorId } },
            body: { base_revision: 0, ops: ops as never },
          });
          if (error) return void notifyError(t("editor.undoDiscardFailed"));
        }
        await reload();
      },
    });
  };

  const onRestored = (version: number) => {
    setHistory(false);
    void reload();
    notify(t("editor.history.restored", { version }));
  };

  return {
    publishing,
    setPublishing,
    openPublish,
    onPublished,
    onRefused,
    discard,
    history,
    setHistory,
    onRestored,
  };
}
