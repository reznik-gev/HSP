/**
 * Ctrl+C / Ctrl+V in the editor (docs/0049, see core/clipboard.ts). The copy is kept in the app
 * and in this browser's storage, so it survives going to another floor's editor, a reload and
 * other tabs; it's also put on the system clipboard as JSON. Ctrl+V pastes at the same
 * coordinates; Ctrl+Shift+V at the pointer. A paste is one undo step and selects what it added.
 */
import type { TFunction } from "i18next";

import {
  copyFragment,
  type Fragment,
  fragmentCentre,
  parseFragment,
  pasteOps,
} from "@/editor/core/clipboard";
import type { Interaction } from "@/editor/core/interaction";
import type { EditorStore } from "@/editor/core/store";
import { notify, notifyError } from "@/lib/notify";

let copied: Fragment | null = null;
const STORAGE_KEY = "hsp.editor.clipboard";

/** This browser's copy, from another tab or before a reload. Storage can be unavailable. */
function fromStorage(): Fragment | null {
  try {
    return parseFragment(localStorage.getItem(STORAGE_KEY) ?? "");
  } catch {
    return null;
  }
}

export function copySelection(store: EditorStore, t: TFunction): boolean {
  const s = store.getState();
  const fragment = s.document && copyFragment(s.document, s.selection);
  if (!fragment) return false;
  copied = fragment;
  const json = JSON.stringify(fragment);
  try {
    localStorage.setItem(STORAGE_KEY, json);
  } catch {
    // Storage full or blocked: the in-app copy still works in this tab.
  }
  // Best effort: the system clipboard may be unavailable (permissions, insecure origin).
  void navigator.clipboard?.writeText(json).catch(() => undefined);
  const count =
    fragment.walls.length +
    fragment.columns.length +
    fragment.zones.length +
    fragment.objects.length;
  notify(t("editor.clipboard.copied", { count }), {
    description: t("editor.clipboard.howToPaste"),
  });
  return true;
}

/** A copy from elsewhere (another browser, an app), from the system clipboard. */
async function fromSystem(): Promise<Fragment | null> {
  try {
    return parseFragment((await navigator.clipboard?.readText()) ?? "");
  } catch {
    return null;
  }
}

export async function pasteCopied(
  store: EditorStore,
  interaction: Interaction,
  atPointer: boolean,
  t: TFunction,
): Promise<void> {
  const fragment = copied ?? fromStorage() ?? (await fromSystem());
  if (!fragment) return void notifyError(t("editor.clipboard.empty"));
  const s = store.getState();
  let offset: [number, number] = [0, 0];
  if (atPointer) {
    const [px, py] = interaction.planAt(interaction.lastPointer.sx, interaction.lastPointer.sy);
    const [cx, cy] = fragmentCentre(fragment);
    const g = s.gridSnap ? s.gridMm : 1;
    offset = [Math.round((px - cx) / g) * g, Math.round((py - cy) / g) * g];
  }
  for (const item of Object.values(fragment.catalog)) s.ensureCatalog(item);
  const { ops, ids } = pasteOps(fragment, offset);
  s.perform(ops);
  s.select(ids);
}
