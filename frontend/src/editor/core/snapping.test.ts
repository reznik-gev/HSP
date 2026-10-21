import { describe, expect, it } from "vitest";

import type { Vec2 } from "./plan";
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
    click([1300, -2000]);
    click([1520, -40]); // near w1's centreline, and 220 mm off the vertical from the start
    expect(store.getState().plan!.walls.at(-1)!.b).toEqual([1520, 0]);
  });

  it("Alt-click places a corner off the grid", () => {
    const { store, click } = editing();
    store.getState().setTool("wall");
    click([-3000, -2000]);
    click([-1234, -2017], { alt: true });
    expect(store.getState().plan!.walls.at(-1)!.b).toEqual([-1234, -2017]);
  });

  it("a dragged junction off any straight line follows the grid", () => {
    const { store, click, drag } = editing();
    click([2000, 50]); // select w1
    drag([4000, 0], [4140, 1500]); // 140 mm off the vertical through w2's far end
    expect(store.getState().plan!.walls[0]!.b).toEqual([4150, 1500]);
  });

  it("G turns grid snap off and on", () => {
    const { store, interaction } = editing();
    interaction.key("g");
    expect(store.getState().gridSnap).toBe(false);
    interaction.key("G");
    expect(store.getState().gridSnap).toBe(true);
  });
});

describe("straight walls (docs/0108)", () => {
  const plan = () => editing().store.getState().plan!;
  const from: Vec2 = [-3000, -2000];

  it("snaps onto the horizontal, vertical or 45° line through the other end", () => {
    const straight = { ...opts, anchors: [from] };
    expect(snapPoint(plan(), [-983, -1960], straight)).toEqual({
      point: [-1000, -2000],
      kind: "horizontal",
    });
    expect(snapPoint(plan(), [-2960, -517], straight)).toEqual({
      point: [-3000, -500],
      kind: "vertical",
    });
    expect(snapPoint(plan(), [-1990, -1030], straight)).toEqual({
      point: [-2000, -1000],
      kind: "diagonal",
    });
  });

  it("only when the pointer is near the line", () => {
    const straight = { ...opts, anchors: [from] };
    expect(snapPoint(plan(), [-983, -1800], straight)).toEqual({
      point: [-1000, -1800],
      kind: "grid",
    });
  });

  it("stays straight with the grid off, in whole millimetres", () => {
    const straight = { ...opts, gridSnap: false, anchors: [from] };
    expect(snapPoint(plan(), [-1013.4, -1975], straight)).toEqual({
      point: [-1013, -2000],
      kind: "horizontal",
    });
  });

  it("a wall end nearby still wins, so walls join", () => {
    const straight = { ...opts, anchors: [[0, -50] as Vec2] };
    expect(snapPoint(plan(), [3960, -20], straight)).toEqual({
      point: [4000, 0],
      kind: "endpoint",
    });
  });

  it("drawn up to another wall, it meets the wall where the straight line crosses it", () => {
    const straight = { ...opts, anchors: [[1500, -2000] as Vec2] };
    expect(snapPoint(plan(), [1530, -30], straight)).toEqual({
      point: [1500, 0],
      kind: "centreline",
    });
  });

  it("Shift keeps to the nearest 45° step, however far off", () => {
    const forced = { ...opts, anchors: [from], straight: true };
    expect(snapPoint(plan(), [-1000, -1500], forced)).toEqual({
      point: [-1000, -2000],
      kind: "horizontal",
    });
  });

  it("Alt still places freely", () => {
    const free = { ...opts, anchors: [from], straight: true, free: true };
    expect(snapPoint(plan(), [-983.4, -1960], free)).toEqual({
      point: [-983, -1960],
      kind: null,
    });
  });

  it("the wall tool draws straight walls", () => {
    const { store, click } = editing();
    store.getState().setTool("wall");
    click(from);
    click([-983, -1960]);
    click([-1500, -1000], { shift: true }); // forced: nearest step from (-1000, -2000) is 135°
    const [first, second] = store.getState().plan!.walls.slice(-2);
    expect([first!.a, first!.b]).toEqual([from, [-1000, -2000]]);
    expect(second!.b).toEqual([-1750, -1250]);
  });

  it("a dragged wall end snaps straight too, against any wall meeting there", () => {
    const { store, click, drag } = editing();
    click([2000, 50]); // select w1: (0,0) → (4000,0), meeting w2 at (4000,0)
    drag([4000, 0], [4030, 1020]); // near the vertical through w2's far end (4000,3000)
    expect(store.getState().plan!.walls[0]!.b).toEqual([4000, 1000]);
  });
});
