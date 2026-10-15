import { describe, expect, it } from "vitest";

import { editing } from "./testPlan";
import { fitOnWall } from "./tools/openingTool";

// The test plan: w1 runs (0,0)→(4000,0) with door o1 at offset 500 (900 wide); w2 runs
// (4000,0)→(4000,3000); desk d1 sits at (2000,1500).

describe("doors and windows (docs/0029, docs/0081)", () => {
  it("fit inside their wall, in 5 cm steps", () => {
    const { store } = editing();
    const w1 = store.getState().plan!.walls[0]!;
    expect(fitOnWall(w1, 2000, 900)).toBe(1550);
    expect(fitOnWall(w1, 100, 900)).toBe(0); // clamped to the start
    expect(fitOnWall(w1, 3990, 900)).toBe(3100); // clamped to the end
    expect(fitOnWall(w1, 2000, 5000)).toBeNull(); // wider than the wall
  });

  it("the Door tool previews on the wall under the pointer and places a standard door", () => {
    const { store, interaction, click, at } = editing();
    store.getState().setTool("door");
    interaction.pointerMove(at([3000, 2000]));
    expect(store.getState().preview).toMatchObject({ kind: "opening", wall_id: null });
    interaction.pointerMove(at([4030, 1500]));
    expect(store.getState().preview).toMatchObject({ wall_id: "w2", offset_mm: 1050 });
    click([4030, 1500]);
    expect(store.getState().plan!.openings.at(-1)).toMatchObject({
      wall_id: "w2",
      type: "door",
      offset_mm: 1050,
      width_mm: 900,
      swing: "left_in",
    });
    click([3000, 2000]); // not on a wall: nothing
    expect(store.getState().plan!.openings).toHaveLength(2);
  });

  it("the Window tool places a window with a sill", () => {
    const { store, click } = editing();
    store.getState().setTool("window");
    click([4000, 1500]);
    expect(store.getState().plan!.openings.at(-1)).toMatchObject({
      type: "window",
      width_mm: 1200,
      height_mm: 1200,
      swing: "none",
    });
    const added = store.getState().document!.openings.at(-1)!;
    expect(added.sill_mm).toBe(900);
  });

  it("clicking a door selects it (not its wall); dragging slides it along the wall", () => {
    const { store, click, drag } = editing();
    click([900, 0]);
    expect([...store.getState().selection]).toEqual(["o1"]);
    drag([900, 0], [2400, 300]);
    expect(store.getState().plan!.openings[0]!.offset_mm).toBe(2000);
    expect(store.getState().undoStack).toHaveLength(1);
  });
});

describe("columns", () => {
  it("the Column tool places a 40 cm square column, as tall as the walls", () => {
    const { store, click } = editing();
    store.getState().setTool("column");
    click([1010, 990]);
    const column = store.getState().document!.columns.at(-1)!;
    expect(column).toMatchObject({
      footprint: [
        [800, 800],
        [1200, 800],
        [1200, 1200],
        [800, 1200],
      ],
      height_mm: 3000,
    });
  });

  it("columns are selected and dragged like furniture, and deleted with Delete", () => {
    const { store, interaction, click, drag } = editing();
    store.getState().setTool("column");
    click([-2000, -2000]);
    store.getState().setTool("select");
    click([-2000, -2000]);
    const id = [...store.getState().selection][0]!;
    drag([-2000, -2000], [-1500, -2000]);
    expect(store.getState().plan!.columns![0]!.footprint[0]).toEqual([-1700, -2200]);
    interaction.key("Delete");
    expect(store.getState().plan!.columns).toEqual([]);
    expect(store.getState().selection.has(id)).toBe(false);
  });
});
