/**
 * What the hint line under the plan says (docs/0130): what you can do now, and which keys
 * change it. It follows the tool, the selection and what's being dragged, all read from the
 * store. The result is a key under `editor.hints` in the translations.
 */
import { wallsAt } from "./edits";
import type { EditorState } from "./store";

export type HintKey =
  | "select"
  | "selectedWall"
  | "selectedZone"
  | "selected"
  | "junction"
  | "junctionDetached"
  | "junctionAlone"
  | "wallMove"
  | "wallMoveDetached"
  | "wallMoveAlone"
  | "dragging"
  | "vertex"
  | "slide"
  | "wall"
  | "wallDrawing"
  | "opening"
  | "column"
  | "zone"
  | "item"
  | "number";

export interface Hint {
  key: HintKey;
  /** How many walls move together, for "junction". */
  walls?: number;
}

type HintState = Pick<EditorState, "tool" | "plan" | "selection" | "preview" | "drag">;

export function editorHint(s: HintState): Hint {
  const p = s.preview;
  switch (s.tool) {
    case "wall":
      return { key: p?.kind === "wall" && p.from ? "wallDrawing" : "wall" };
    case "door":
    case "window":
      return { key: "opening" };
    case "column":
      return { key: "column" };
    case "zone":
      return { key: "zone" };
    case "item":
      return { key: "item" };
    case "number":
      return { key: "number" };
    case "select":
      break;
  }
  const plan = s.plan;
  if (p?.kind === "junction" && plan) {
    if (p.walls.length > 1) return { key: "junction", walls: p.walls.length };
    return { key: wallsAt(plan, p.from).length > 1 ? "junctionDetached" : "junctionAlone" };
  }
  if (p?.kind === "wallMove" && plan) {
    if (p.joinedA.length || p.joinedB.length) return { key: "wallMove" };
    const w = plan.walls.find((x) => x.id === p.id);
    const joined = w && [w.a, w.b].some((end) => wallsAt(plan, end).length > 1);
    return { key: joined ? "wallMoveDetached" : "wallMoveAlone" };
  }
  if (p?.kind === "vertex") return { key: "vertex" };
  if (p?.kind === "opening" && p.id) return { key: "slide" };
  if (s.drag) return { key: "dragging" };
  if (!s.selection.size || !plan) return { key: "select" };
  const ids = [...s.selection];
  if (ids.length === 1 && plan.walls.some((w) => w.id === ids[0])) return { key: "selectedWall" };
  if (ids.length === 1 && plan.zones.some((z) => z.id === ids[0])) return { key: "selectedZone" };
  return { key: "selected" };
}
