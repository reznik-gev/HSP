/**
 * The editor's top bar (docs/0089): Exit, the floor, where the draft stands ("Draft 4 · Saved"),
 * Undo / Redo (docs/0050), the version history, Discard draft and Publish (docs/0082).
 */
import { History, Redo2, Undo2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";

import { Button } from "@/components/ui/button";
import type { EditorStore } from "@/editor/core/store";

import type { SaveState } from "./session/autosave";
import type { EditorPlanSource } from "./session/editorPlan";

export function EditorTopBar({
  floorName,
  store,
  source,
  publishedVersion,
  save,
  onExit,
  onHistory,
  onDiscard,
  onPublish,
}: {
  floorName: string | null;
  store: EditorStore;
  source: EditorPlanSource | null;
  publishedVersion: number | null;
  save: SaveState;
  onExit: () => void;
  onHistory: () => void;
  /** Null while there's no draft to discard. */
  onDiscard: (() => void) | null;
  /** Null while there's nothing to publish yet. */
  onPublish: (() => void) | null;
}) {
  const { t } = useTranslation();
  const canUndo = useStore(store, (s) => s.undoStack.length > 0);
  const canRedo = useStore(store, (s) => s.redoStack.length > 0);
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-card px-4">
      <Button variant="ghost" size="sm" onClick={onExit}>
        <X aria-hidden />
        {t("editor.exit")}
      </Button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold">
          {floorName ? t("editor.title", { floor: floorName }) : " "}
        </h1>
        {source && (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            <DraftStatus source={source} publishedVersion={publishedVersion} save={save} />
          </p>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("editor.undo")}
          title={t("editor.undoShortcut")}
          disabled={!canUndo}
          onClick={() => store.getState().undo()}
        >
          <Undo2 aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("editor.redo")}
          title={t("editor.redoShortcut")}
          disabled={!canRedo}
          onClick={() => store.getState().redo()}
        >
          <Redo2 aria-hidden />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("editor.history.title")}
          title={t("editor.history.title")}
          onClick={onHistory}
        >
          <History aria-hidden />
        </Button>
        {onDiscard && (
          <Button variant="outline" size="sm" onClick={onDiscard}>
            {t("editor.discard")}
          </Button>
        )}
        <Button size="sm" disabled={!onPublish} onClick={() => onPublish?.()}>
          {t("editor.publish.button")}
        </Button>
      </div>
    </header>
  );
}

function DraftStatus({
  source,
  publishedVersion,
  save,
}: {
  source: EditorPlanSource;
  publishedVersion: number | null;
  save: SaveState;
}) {
  const { t } = useTranslation();
  const progress =
    save.status === "pending" || save.status === "saving"
      ? t("editor.save.saving")
      : save.status === "offline"
        ? t("editor.save.offline")
        : save.status === "paused"
          ? t("editor.save.paused")
          : t("editor.save.saved");
  if (save.version) return `${t("editor.status.draft", { version: save.version })} · ${progress}`;
  if (save.status !== "saved") return progress;
  return source === "published"
    ? t("editor.status.published", { version: publishedVersion })
    : t("editor.status.new");
}
