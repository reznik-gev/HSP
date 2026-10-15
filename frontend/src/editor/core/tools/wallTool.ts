/**
 * The wall tool (docs/0044, docs/0089): click to start, click again for each corner; every
 * segment is its own wall and its own undo step, starting where the last one ended, so walls
 * join exactly. Clicking the chain's first point closes the room and ends the chain, as do
 * Enter, Escape and the right mouse button. Points snap to wall ends, then to the grid.
 *
 * The chain lives in the store's preview, so switching tools always ends it.
 */
import { addWall } from "../edits";
import type { Vec2 } from "../plan";
import { snapPoint } from "../snap";
import type { EditorStore } from "../store";

const same = (p: Vec2, q: Vec2) => p[0] === q[0] && p[1] === q[1];

export class WallTool {
  constructor(private readonly store: EditorStore) {}

  private chain() {
    const preview = this.store.getState().preview;
    return preview?.kind === "wall" ? preview : { start: null, from: null };
  }

  private snap(p: Vec2) {
    const s = this.store.getState();
    const { start } = this.chain();
    return snapPoint(s.plan!, p, {
      mmPerPx: s.viewport.mmPerPx,
      gridMm: s.gridMm,
      gridSnap: s.gridSnap,
      extra: start ? [start] : [],
    });
  }

  /** The pointer moved: show where the next corner would go. */
  hover(p: Vec2): void {
    if (!this.store.getState().plan) return;
    const { start, from } = this.chain();
    const { point, kind } = this.snap(p);
    this.store.getState().setPreview({ kind: "wall", start, from, to: point, snap: kind });
  }

  click(p: Vec2): void {
    const s = this.store.getState();
    if (!s.plan) return;
    const { start, from } = this.chain();
    const { point, kind } = this.snap(p);
    if (!from || !start) {
      s.setPreview({ kind: "wall", start: point, from: point, to: point, snap: kind });
      return;
    }
    if (same(from, point)) return;
    s.perform([addWall(from, point, s.wallDefaults)]);
    const closed = same(point, start);
    this.store.getState().setPreview({
      kind: "wall",
      start: closed ? null : start,
      from: closed ? null : point,
      to: point,
      snap: kind,
    });
  }

  /** Ends the chain; the tool stays on for the next one. Returns whether there was a chain. */
  finish(): boolean {
    const s = this.store.getState();
    const preview = s.preview;
    if (preview?.kind !== "wall" || !preview.from) return false;
    s.setPreview({ ...preview, start: null, from: null });
    return true;
  }
}
