/**
 * Dragging a group in Select (part of SelectTool, docs/0133): a selection with walls, zones,
 * doors or windows, dragged by one of them, moves it all, as the arrow keys do. It moves in grid
 * steps, and Alt frees it while held. Alt pressed at any point detaches the walls joined to it,
 * and it stays detached until the drag ends (docs/0130). R mid-drag turns its furniture where
 * it is, saved with the move (docs/0135). The move is saved as one step to undo.
 */
import { movedBy, nudgeOps } from "../edits";
import type { Vec2 } from "../plan";
import { dragged, type EditorStore } from "../store";

/**
 * A selection with walls, zones, doors or windows, dragged by one of them (docs/0133).
 * `detach`: Alt was held at some point, so the walls joined to it don't stretch (docs/0130).
 * `d` is how far it has moved, and `spin` how far R turned its furniture on the way (docs/0135).
 */
export interface GroupDrag {
  kind: "group";
  start: Vec2;
  moved: boolean;
  detach: boolean;
  d: Vec2;
  spin: number;
}

/** A drag of several elements by `d`, in grid steps; whole millimetres with Alt or no grid. */
export function gridStep(store: EditorStore, d: Vec2, alt?: boolean): Vec2 {
  const s = store.getState();
  const snap = (v: number) =>
    s.gridSnap && !alt ? Math.round(v / s.gridMm) * s.gridMm : Math.round(v);
  return [snap(d[0]), snap(d[1])];
}

/** Whether the selection has more than items and columns, which a plain drag moves on its own. */
export function mixedSelection(store: EditorStore): boolean {
  const s = store.getState();
  const columns = new Set((s.plan?.columns ?? []).map((c) => c.id));
  return [...s.selection].some((id) => !s.plan?.objects[id] && !columns.has(id));
}

/**
 * The group moved by `g.d`, its furniture turned by `g.spin`: the drag state for items and
 * columns, and the preview, with the ops that will save it all, for the rest.
 */
export function showGroup(store: EditorStore, g: GroupDrag): void {
  const s = store.getState();
  if (!s.plan) return;
  const plan = s.plan;
  const drag = { dx: g.d[0], dy: g.d[1], spin: g.spin || undefined };
  // R's turns go with the move, one step to undo; `dragged` says how each item turns, as it
  // does on screen (docs/0135).
  const ops = nudgeOps(plan, s.selection, g.d, g.detach).map((op) =>
    g.spin && op.op === "update" && op.kind === "object"
      ? {
          ...op,
          data: { ...op.data, rotation_ddeg: dragged(plan.objects[op.id]!, drag).rotation_ddeg },
        }
      : op,
  );
  s.setDrag(drag);
  s.setPreview({ kind: "group", ops, ...movedBy(s.plan, ops) });
}

/** Saves the group's move, as one step to undo. */
export function commitGroup(store: EditorStore): void {
  const s = store.getState();
  const preview = s.preview;
  s.setPreview(null);
  s.setDrag(null);
  if (preview?.kind === "group") s.perform([...preview.ops]);
}
