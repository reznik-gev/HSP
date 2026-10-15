import { describe, expect, it } from "vitest";

import { STUB_DESK_ITEM, STUB_MONITOR_ITEM } from "@/test/stubs";

import type { PlanCatalogItem } from "./edits";

import { placeItem } from "./furnitureSnap";
import { editing } from "./testPlan";

// The test plan: w1 (0,0)→(4000,0) and w2 (4000,0)→(4000,3000), both 150 mm thick; desk d1
// (160 × 80 cm) at (2000,1500) with monitor m1 on it. 1 px = 10 mm: the reach is 80 mm.
const opts = { mmPerPx: 10, gridMm: 50, gridSnap: true };
const DESK = STUB_DESK_ITEM;

describe("face snap (docs/0047)", () => {
  it("an item near a wall sits flush against it, back to the wall", () => {
    const plan = editing().store.getState().plan!;
    // North of w1: the face is at y = 75, so the desk's centre goes to 75 + 400 = 475.
    expect(placeItem(plan, DESK, [1010, 500], 450, opts)).toEqual({
      at: [1000, 475],
      rotation_ddeg: 0,
      attachedTo: null,
      snap: "face",
    });
    // South of w1: turned around, facing south.
    expect(placeItem(plan, DESK, [1000, -520], 0, opts)).toMatchObject({
      at: [1000, -475],
      rotation_ddeg: 1800,
    });
    // West of w2 (x = 4000), facing west.
    expect(placeItem(plan, DESK, [3550, 1500], 0, opts)).toMatchObject({
      at: [3525, 1500],
      rotation_ddeg: 900,
    });
  });

  it("away from walls: the grid, keeping the item's turn; Alt: exactly where the pointer is", () => {
    const plan = editing().store.getState().plan!;
    expect(placeItem(plan, DESK, [-2012, -2988], 450, opts)).toEqual({
      at: [-2000, -3000],
      rotation_ddeg: 450,
      attachedTo: null,
      snap: "grid",
    });
    expect(placeItem(plan, DESK, [1010, 500], 0, { ...opts, free: true })).toMatchObject({
      at: [1010, 500],
      snap: null,
    });
  });
});

describe("attach snap (docs/0047)", () => {
  it("an attachable item over a compatible host lands on it, turned like the host", () => {
    const { store } = editing();
    const plan = store.getState().plan!;
    expect(placeItem(plan, STUB_MONITOR_ITEM, [2300, 1400], 0, opts)).toEqual({
      at: [2300, 1400],
      rotation_ddeg: 0,
      attachedTo: "d1",
      snap: "attach",
    });
    // A desk can't sit on a desk.
    expect(placeItem(plan, DESK, [2300, 1400], 0, opts).attachedTo).toBeNull();
  });

  it("the item tool places it attached; dragging it off its host detaches it", () => {
    const { store, click, drag } = editing();
    store.getState().setTool("item");
    store.getState().setPlacing(STUB_MONITOR_ITEM as PlanCatalogItem);
    click([1700, 1600]);
    const placed = store.getState().document!.objects.at(-1)!;
    expect(placed).toMatchObject({ attached_to: "d1", position: [1700, 1600, 0] });

    store.getState().setTool("select");
    store.getState().clearSelection();
    click([1700, 1600]); // the new monitor, on top of the desk
    expect([...store.getState().selection]).toEqual([placed.id]);
    drag([1700, 1600], [-2000, -2000]);
    expect(store.getState().document!.objects.at(-1)).toMatchObject({ attached_to: null });
  });
});

describe("dragging one item", () => {
  it("against a wall turns it to face away; what's on it turns along, as one step", () => {
    const { store, click, drag } = editing();
    click([2000, 1500]); // the desk (and its monitor)
    drag([2000, 1500], [3560, 1500]); // towards w2's west face
    const { d1, m1 } = store.getState().plan!.objects;
    expect(d1).toMatchObject({ position: [3525, 1500, 0], rotation_ddeg: 900 });
    // The monitor sat 200 mm north of the desk's centre; turned a quarter, it's 200 mm west.
    expect(m1).toMatchObject({ position: [3325, 1500, 740], rotation_ddeg: 900 });
    expect(store.getState().undoStack).toHaveLength(1);
  });
});
