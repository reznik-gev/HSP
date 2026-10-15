import { describe, expect, it } from "vitest";

import { deleteSelection, moveJunction, wallsAt } from "./edits";
import { Interaction } from "./interaction";
import type { ApiPlan } from "./operations";
import type { Vec2 } from "./plan";
import { snapPoint } from "./snap";
import { createEditorStore } from "./store";
import { planToScreen } from "./viewport";

const wall = (id: string, a: Vec2, b: Vec2) => ({ id, a, b, thickness_mm: 150, height_mm: 3000 });
const DESK_ITEM = {
  id: "rev",
  key: "desk",
  category: "desk",
  shape: "box",
  width_mm: 1600,
  depth_mm: 800,
  height_mm: 740,
  color: null,
  is_seat: true,
};
const MONITOR_ITEM = {
  ...DESK_ITEM,
  id: "mon",
  key: "monitor",
  category: "monitor",
  width_mm: 600,
  depth_mm: 200,
  is_seat: false,
};
const PLAN = {
  floor_id: "f",
  version: 1,
  state: "draft",
  revision: 1,
  // An L: w1 and w2 meet at (4000, 0).
  walls: [wall("w1", [0, 0], [4000, 0]), wall("w2", [4000, 0], [4000, 3000])],
  openings: [
    {
      id: "o1",
      wall_id: "w1",
      type: "door",
      offset_mm: 500,
      width_mm: 900,
      height_mm: 2100,
      sill_mm: 0,
      swing: "left_in",
    },
  ],
  columns: [],
  zones: [],
  objects: [
    {
      id: "d1",
      catalog_item_rev_id: "rev",
      position: [2000, 1500, 0],
      rotation_ddeg: 0,
      label: "A-01",
      attached_to: null,
    },
    {
      id: "m1",
      catalog_item_rev_id: "mon",
      position: [2000, 1700, 740],
      rotation_ddeg: 0,
      label: null,
      attached_to: "d1",
    },
  ],
  catalog: { rev: DESK_ITEM, mon: MONITOR_ITEM },
} as unknown as ApiPlan;

function editing() {
  const store = createEditorStore();
  store.getState().loadDocument(PLAN, new Map());
  // 1 px = 10 mm, plan origin at the centre of an 800 × 600 canvas.
  store.getState().setViewport({ cx: 0, cy: 0, mmPerPx: 10 });
  const interaction = new Interaction(store);
  interaction.setSize(800, 600);
  const at = (p: Vec2) => {
    const [sx, sy] = planToScreen(store.getState().viewport, [800, 600], p);
    return { sx, sy, button: 0, shift: false };
  };
  const click = (p: Vec2, extra = {}) => {
    interaction.pointerDown({ ...at(p), ...extra });
    interaction.pointerUp({ ...at(p), ...extra });
  };
  const drag = (from: Vec2, to: Vec2, extra = {}) => {
    interaction.pointerDown({ ...at(from), ...extra });
    interaction.pointerMove({ ...at(to), ...extra });
    interaction.pointerUp({ ...at(to), ...extra });
  };
  return { store, interaction, click, drag, at };
}

describe("edits (docs/0044, docs/0081)", () => {
  it("deleting a wall takes its doors; deleting a desk takes its monitor", () => {
    const plan = editing().store.getState().plan!;
    expect(deleteSelection(plan, new Set(["w1", "d1"]))).toEqual([
      { op: "delete", kind: "opening", id: "o1" },
      { op: "delete", kind: "wall", id: "w1" },
      { op: "delete", kind: "object", id: "m1" },
      { op: "delete", kind: "object", id: "d1" },
    ]);
  });

  it("a junction moves every wall that meets there, and never collapses a wall", () => {
    const plan = editing().store.getState().plan!;
    expect(wallsAt(plan, [4000, 0])).toEqual(["w1", "w2"]);
    expect(moveJunction(plan, ["w1", "w2"], [4000, 0], [4500, 0])).toEqual([
      { op: "update", kind: "wall", id: "w1", data: { b: [4500, 0] } },
      { op: "update", kind: "wall", id: "w2", data: { a: [4500, 0] } },
    ]);
    expect(moveJunction(plan, ["w2"], [4000, 0], [4000, 3000])).toEqual([]);
  });

  it("snapping: wall ends first, then the grid", () => {
    const plan = editing().store.getState().plan!;
    const opts = { mmPerPx: 10, gridMm: 50, gridSnap: true };
    expect(snapPoint(plan, [4060, 30], opts)).toEqual({ point: [4000, 0], kind: "endpoint" });
    expect(snapPoint(plan, [1234, 1260], opts)).toEqual({ point: [1250, 1250], kind: "grid" });
    expect(snapPoint(plan, [1234, 1260], { ...opts, gridSnap: false })).toEqual({
      point: [1234, 1260],
      kind: null,
    });
  });
});

describe("the wall tool (docs/0044, docs/0089)", () => {
  it("draws a room corner by corner, each wall one undo step, and closes on the first point", () => {
    const { store, click } = editing();
    store.getState().setTool("wall");
    click([-3000, -2000]);
    click([-1000, -2000]);
    click([-1000, -1000]);
    click([-3020, -2010]); // close enough to snap onto the start
    const walls = store.getState().plan!.walls.slice(2);
    expect(walls.map((w) => [w.a, w.b])).toEqual([
      [
        [-3000, -2000],
        [-1000, -2000],
      ],
      [
        [-1000, -2000],
        [-1000, -1000],
      ],
      [
        [-1000, -1000],
        [-3000, -2000],
      ],
    ]);
    expect(walls[0]).toMatchObject({ thickness_mm: 150, height_mm: 3000 });
    expect(store.getState().undoStack).toHaveLength(3);
    // The room is closed: the next click starts a new chain instead of adding a wall.
    click([0, 2000]);
    expect(store.getState().plan!.walls).toHaveLength(5);
  });

  it("Escape ends the chain, then a second Escape goes back to Select", () => {
    const { store, interaction, click } = editing();
    store.getState().setTool("wall");
    click([-3000, -2000]);
    click([-1000, -2000]);
    expect(interaction.key("Escape")).toBe(true);
    click([0, -2500]);
    expect(store.getState().plan!.walls).toHaveLength(3); // a new chain started, no wall yet
    interaction.key("Escape");
    interaction.key("Escape");
    expect(store.getState().tool).toBe("select");
  });

  it("dragging the canvas pans instead of placing a corner", () => {
    const { store, drag } = editing();
    store.getState().setTool("wall");
    drag([-3000, -2000], [-2000, -2000]);
    expect(store.getState().preview).toBeNull();
    expect(store.getState().viewport.cx).toBe(-1000);
  });
});

describe("selecting and changing walls", () => {
  it("click selects a wall; dragging its end moves the junction with the other wall", () => {
    const { store, click, drag } = editing();
    click([2000, 50]);
    expect([...store.getState().selection]).toEqual(["w1"]);
    drag([4000, 0], [4500, 0]);
    const walls = store.getState().plan!.walls;
    expect(walls[0]!.b).toEqual([4500, 0]);
    expect(walls[1]!.a).toEqual([4500, 0]);
    expect(store.getState().undoStack).toHaveLength(1);
  });

  it("Alt-drag detaches just the selected wall", () => {
    const { store, click, drag } = editing();
    click([2000, 50]);
    drag([4000, 0], [4500, 0], { alt: true });
    const walls = store.getState().plan!.walls;
    expect(walls[0]!.b).toEqual([4500, 0]);
    expect(walls[1]!.a).toEqual([4000, 0]);
  });

  it("Delete removes the selection with its doors; undo brings both back", () => {
    const { store, interaction, click } = editing();
    click([2000, 50]);
    interaction.key("Delete");
    expect(store.getState().plan!.walls.map((w) => w.id)).toEqual(["w2"]);
    expect(store.getState().plan!.openings).toEqual([]);
    store.getState().undo();
    expect(store.getState().plan!.walls).toHaveLength(2);
    expect(store.getState().plan!.openings).toHaveLength(1);
  });
});
