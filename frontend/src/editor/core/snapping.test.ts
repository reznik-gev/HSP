import { describe, expect, it } from "vitest";

import { snapPoint } from "./snap";
import { editing } from "./testPlan";

// The test plan: w1 (0,0)→(4000,0) meets w2 (4000,0)→(4000,3000). 1 px = 10 mm, so the
// snapping reach is 80 mm.
const opts = { mmPerPx: 10, gridMm: 50, gridSnap: true };

describe("snapping order (docs/0047, docs/0092)", () => {
  it("wall ends, then midpoints, then a wall's centreline, then the grid", () => {
    const plan = editing().store.getState().plan!;
    expect(snapPoint(plan, [4060, 30], opts)).toEqual({ point: [4000, 0], kind: "endpoint" });
    expect(snapPoint(plan, [2030, 40], opts)).toEqual({ point: [2000, 0], kind: "midpoint" });
    expect(snapPoint(plan, [1234, 60], opts)).toEqual({ point: [1234, 0], kind: "centreline" });
    expect(snapPoint(plan, [1234, 260], opts)).toEqual({ point: [1250, 250], kind: "grid" });
  });

  it("holding Alt places freely, in whole millimetres", () => {
    const plan = editing().store.getState().plan!;
    expect(snapPoint(plan, [4060.4, 30.6], { ...opts, free: true })).toEqual({
      point: [4060, 31],
      kind: null,
    });
  });

  it("can leave out walls that are being moved", () => {
    const plan = editing().store.getState().plan!;
    const without = { ...opts, ignoreWalls: new Set(["w1"]) };
    expect(snapPoint(plan, [1234, 60], without).kind).toBe("grid");
  });
});

describe("snapping while drawing and dragging", () => {
  it("a wall drawn to another wall's side meets it exactly: a T-junction (docs/0044)", () => {
    const { store, click } = editing();
    store.getState().setTool("wall");
    click([1500, -2000]);
    click([1520, -40]); // near w1's centreline
    expect(store.getState().plan!.walls.at(-1)!.b).toEqual([1520, 0]);
  });

  it("Alt-click places a corner off the grid", () => {
    const { store, click } = editing();
    store.getState().setTool("wall");
    click([-3000, -2000]);
    click([-1234, -2017], { alt: true });
    expect(store.getState().plan!.walls.at(-1)!.b).toEqual([-1234, -2017]);
  });

  it("dragging a junction doesn't snap to the moving walls themselves", () => {
    const { store, click, drag } = editing();
    click([2000, 50]); // select w1
    drag([4000, 0], [4040, 1500]); // along w2, which moves too
    expect(store.getState().plan!.walls[0]!.b).toEqual([4050, 1500]);
  });

  it("G turns grid snap off and on", () => {
    const { store, interaction } = editing();
    interaction.key("g");
    expect(store.getState().gridSnap).toBe(false);
    interaction.key("G");
    expect(store.getState().gridSnap).toBe(true);
  });
});
