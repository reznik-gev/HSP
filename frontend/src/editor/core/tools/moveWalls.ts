/**
 * Moving walls in Select (part of SelectTool). Dragging a selected wall's end moves the junction
 * with every wall that meets there (Alt detaches just that wall, docs/0044); dragging a selected
 * wall's body moves the whole wall and the walls joined to it stretch (Alt detaches it,
 * docs/0108). Alt pressed at any point in the drag detaches, and it stays detached until the
 * drag ends, while snapping follows Alt as it's held (docs/0130).
 */
import { moveJunction, moveWall, wallsAt } from "../edits";
import type { Plan, Vec2, Wall } from "../plan";
import { SNAP_PX, snapPoint, snapSettings } from "../snap";
import type { EditorState, Preview } from "../store";

/** A junction dragged by the end of the selected wall `grabbed`; `walls` move with it. */
export interface JunctionDrag {
  kind: "junction";
  from: Vec2;
  grabbed: string;
  walls: string[];
}

/** A selected wall dragged by its body; the walls joined at its ends stretch (docs/0108). */
export interface WallDrag {
  kind: "wall";
  id: string;
  start: Vec2;
  a: Vec2;
  b: Vec2;
  joinedA: string[];
  joinedB: string[];
}

/** The far ends of `walls` from their junction `at`: a dragged corner keeps straight from them
 *  (docs/0108). */
function farEnds(plan: Plan, walls: readonly string[], at: Vec2): Vec2[] {
  return plan.walls
    .filter((w) => walls.includes(w.id))
    .map((w) => (w.a[0] === at[0] && w.a[1] === at[1] ? w.b : w.a));
}

/** An end of a selected wall near the pointer, which can be dragged. */
export function selectedWallEnd(s: EditorState, p: Vec2): { point: Vec2; wall: string } | null {
  const reach = SNAP_PX * s.viewport.mmPerPx;
  for (const w of s.plan?.walls ?? []) {
    if (!s.selection.has(w.id)) continue;
    for (const point of [w.a, w.b]) {
      if (Math.hypot(point[0] - p[0], point[1] - p[1]) <= reach) return { point, wall: w.id };
    }
  }
  return null;
}

/** Takes hold of the junction at a selected wall's end; Alt takes just that wall. */
export function junctionDrag(
  plan: Plan,
  end: { point: Vec2; wall: string },
  alt?: boolean,
): JunctionDrag {
  const walls = alt ? [end.wall] : wallsAt(plan, end.point);
  return { kind: "junction", from: end.point, grabbed: end.wall, walls };
}

/** Takes hold of the selected wall `w` by its body at `p`; Alt detaches it (docs/0108). */
export function wallDrag(plan: Plan, w: Wall, p: Vec2, alt?: boolean): WallDrag {
  const others = (q: Vec2) => (alt ? [] : wallsAt(plan, q).filter((id) => id !== w.id));
  return {
    kind: "wall",
    id: w.id,
    start: p,
    a: w.a,
    b: w.b,
    joinedA: others(w.a),
    joinedB: others(w.b),
  };
}

/** Where the dragged junction goes, snapped, with the pointer at `p`. */
export function junctionPreview(
  s: EditorState,
  plan: Plan,
  g: JunctionDrag,
  p: Vec2,
  alt?: boolean,
  shift?: boolean,
): Preview {
  // Alt pressed mid-drag detaches too, and stays detached (docs/0130).
  if (alt) g.walls = [g.grabbed];
  const { point, kind } = snapPoint(plan, p, {
    ...snapSettings(s, alt),
    ignore: g.from,
    // The moving walls' own centrelines move with them.
    ignoreWalls: new Set(g.walls),
    // Straight from the far end of any wall meeting here (docs/0108).
    anchors: farEnds(plan, g.walls, g.from),
    straight: shift,
  });
  return { kind: "junction", from: g.from, to: point, walls: g.walls, snap: kind };
}

/**
 * Where a dragged wall goes: moved with the pointer, then snapped by whichever end snaps to
 * something (a wall's end, midpoint or side) with the smaller correction, else by its first
 * end to the grid. The wall and the walls stretching with it aren't snapped to.
 */
export function wallMove(s: EditorState, plan: Plan, g: WallDrag, p: Vec2, alt?: boolean): Preview {
  const d: Vec2 = [p[0] - g.start[0], p[1] - g.start[1]];
  const opts = {
    ...snapSettings(s, alt),
    ignoreWalls: new Set([g.id, ...g.joinedA, ...g.joinedB]),
  };
  const want = (end: Vec2): Vec2 => [end[0] + d[0], end[1] + d[1]];
  const ends = [g.a, g.b].map((end) => ({ end, snapped: snapPoint(plan, want(end), opts) }));
  const onSomething = ends.filter((x) => x.snapped.kind && x.snapped.kind !== "grid");
  const correction = (x: (typeof ends)[number]) =>
    Math.hypot(x.snapped.point[0] - want(x.end)[0], x.snapped.point[1] - want(x.end)[1]);
  const best = onSomething.sort((x, y) => correction(x) - correction(y))[0] ?? ends[0]!;
  return {
    kind: "wallMove",
    id: g.id,
    d: [best.snapped.point[0] - best.end[0], best.snapped.point[1] - best.end[1]],
    at: best.snapped.point,
    snap: best.snapped.kind,
    joinedA: g.joinedA,
    joinedB: g.joinedB,
  };
}

/** Saves the junction or wall drag shown in the preview, and clears the preview. */
export function dropWalls(s: EditorState, g: JunctionDrag | WallDrag): void {
  const preview = s.preview;
  s.setPreview(null);
  if (g.kind === "junction" && preview?.kind === "junction" && s.plan) {
    s.perform(moveJunction(s.plan, g.walls, g.from, preview.to));
  } else if (g.kind === "wall" && preview?.kind === "wallMove" && s.plan) {
    s.perform(moveWall(s.plan, g.id, preview.d, g.joinedA, g.joinedB));
  }
}
