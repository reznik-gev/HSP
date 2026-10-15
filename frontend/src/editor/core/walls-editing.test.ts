import { describe, expect, it } from "vitest";

import { deleteSelection, moveJunction, wallsAt } from "./edits";
import { snapPoint } from "./snap";
import { editing } from "./testPlan";

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
