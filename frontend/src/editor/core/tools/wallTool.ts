/**
 * The wall tool (docs/0044, docs/0089): click to start, click again for each corner; every
 * segment is its own wall and its own undo step, starting where the last one ended, so walls
 * join exactly. Clicking the chain's first point closes the room and ends the chain, as do
 * Enter, Escape and the right mouse button. Points snap as docs/0047 says (see snap.ts), and
 * straight from the last corner (docs/0108; Shift forces it); a typed length (and angle) places
 * the next corner exactly (docs/0045).
 *
 * The chain lives in the store's preview, so switching tools always ends it.
 */
import { addWall } from "../edits";
import type { Vec2 } from "../plan";
import { type Measure, measuredPoint } from "../measure";
import { type SnapKind, snapPoint, snapSettings } from "../snap";
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
    const { start, from } = this.chain();
    return snapPoint(s.plan!, p, {
      ...snapSettings(s, s.snapFree),
      extra: start ? [start] : [],
      // The next corner keeps straight from the last one (docs/0108).
      anchors: from ? [from] : [],
      straight: s.snapStraight,
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
    if (!this.store.getState().plan) return;
    const { point, kind } = this.snap(p);
    this.corner(point, kind);
  }

  /**
   * Places the next corner `m` away from the last one (typed, docs/0045): in the typed
   * direction, or towards the pointer. Returns false when no chain is being drawn.
   */
  placeTyped(m: Measure): boolean {
    const preview = this.store.getState().preview;
    if (preview?.kind !== "wall" || !preview.from) return false;
    this.corner(measuredPoint(preview.from, preview.to, m), null);
    return true;
  }

  /** The chain being drawn, if any: typing a length then places its next corner. */
  drawing(): boolean {
    return Boolean(this.chain().from);
  }

  private corner(point: Vec2, kind: SnapKind): void {
    const s = this.store.getState();
    const { start, from } = this.chain();
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
