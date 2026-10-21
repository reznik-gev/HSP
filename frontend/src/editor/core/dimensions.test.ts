import { describe, expect, it } from "vitest";

import { dimensionsFor } from "./dimensions";
import { applyOps } from "./operations";
import { editing } from "./testPlan";

// The test plan: w1 (0,0)→(4000,0) and w2 (4000,0)→(4000,3000), 150 mm thick; desk d1
// (160 × 80 cm, not turned) at (2000,1500) with monitor m1 on it.

describe("dimensions on the plan (docs/0045)", () => {
  it("a selected wall shows its length beside it; editing it moves its free end", () => {
    const { store } = editing();
    const plan = store.getState().plan!;
    const [length] = dimensionsFor(plan, new Set(["w1"]), 200);
    expect(length).toMatchObject({ key: "length", from: [0, 275], to: [4000, 275], valueMm: 4000 });
    // w1's corner with w2 stays; its free end and its door move out (docs/0108).
    expect(length!.edit(5000)).toEqual([
      { op: "update", kind: "wall", id: "w1", data: { a: [-1000, 0] } },
      { op: "update", kind: "opening", id: "o1", data: { offset_mm: 1500 } },
    ]);
    expect(length!.edit(1000)).toBeNull(); // its door wouldn't fit
  });

  it("a selected item shows its distance to the nearest wall faces", () => {
    const { store } = editing();
    const plan = store.getState().plan!;
    const dims = dimensionsFor(plan, new Set(["d1", "m1"]), 200);
    // East: desk edge at x = 2800, w2's face at 4000 − 75. South: edge 1100, w1's face at 75.
    expect(dims.map((d) => [d.key, d.valueMm])).toEqual([
      ["east", 1125],
      ["south", 1025],
    ]);
    expect(dims[0]).toMatchObject({ from: [2800, 1500], to: [3925, 1500] });
  });

  it("editing a distance moves the item (and what's on it) until it's that far", () => {
    const { store } = editing();
    const s = store.getState();
    const south = dimensionsFor(s.plan!, new Set(["d1", "m1"]), 200).find(
      (d) => d.key === "south",
    )!;
    const ops = south.edit(500)!;
    const after = applyOps(s.document!, ops).plan;
    expect(after.objects.find((o) => o.id === "d1")!.position).toEqual([2000, 975, 0]);
    expect(after.objects.find((o) => o.id === "m1")!.position).toEqual([2000, 1175, 740]);
  });

  it("nothing for several elements or for zones", () => {
    const { store } = editing();
    const plan = store.getState().plan!;
    expect(dimensionsFor(plan, new Set(["w1", "w2"]), 200)).toEqual([]);
    expect(dimensionsFor(plan, new Set(), 200)).toEqual([]);
  });
});
