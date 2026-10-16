import { describe, expect, it } from "vitest";

import {
  STUB_DESK_ITEM,
  STUB_MONITOR_ITEM,
  stubDesk,
  stubDoor,
  stubMonitor,
  stubPlan,
  stubScreen,
  stubWall,
} from "@/test/stubs";

import { heightTag, isRaised, itemTag, metres, stackingOrder, windowTag } from "./heights";
import type { ApiPlan } from "./operations";
import type { Opening } from "./plan";
import { editing } from "./testPlan";

describe("height helpers", () => {
  it("counts an item as raised only when it's off the floor on its own", () => {
    expect(isRaised({ position: [0, 0, 1400], attached_to: null })).toBe(true);
    expect(isRaised({ position: [0, 0, 0], attached_to: null })).toBe(false);
    // A monitor on a desk stands at the desk top but belongs to the desk.
    expect(isRaised({ position: [0, 0, 740], attached_to: "d1" })).toBe(false);
  });

  it("writes heights in metres, bottom to top", () => {
    expect(metres(1800)).toBe("1.80");
    expect(heightTag(1800, 2100)).toBe("1.80–2.10");
    expect(itemTag({ position: [0, 0, 1400] }, STUB_MONITOR_ITEM)).toBe("1.40–1.85");
  });

  it("tags windows from sill to top, and not doors", () => {
    const door = stubDoor("o1", "w1", 500) as Opening;
    expect(windowTag(door)).toBeNull();
    expect(windowTag({ ...door, type: "window", sill_mm: 900, height_mm: 1200 })).toBe("0.90–2.10");
  });

  it("stacks things by the height they stand at, keeping ties in order", () => {
    const objects = [
      stubScreen("shelf", [0, 0]),
      stubMonitor("m1", "d1", [0, 0]),
      stubDesk("d1", [0, 0]),
      stubDesk("d2", [3000, 0]),
    ];
    const heights: Record<string, number> = {
      [STUB_DESK_ITEM.id]: STUB_DESK_ITEM.height_mm,
      [STUB_MONITOR_ITEM.id]: STUB_MONITOR_ITEM.height_mm,
    };
    // Desks on the floor, the monitor on its desk (740), the screen at 1400.
    expect(stackingOrder(objects, (rev) => heights[rev] ?? 0)).toEqual(["d1", "d2", "m1", "shelf"]);
  });
});

describe("raised items on the plan", () => {
  const plan = stubPlan({
    walls: [stubWall("w1", [0, 0], [4000, 0])],
    objects: [stubScreen("s1", [2000, 1500]), stubDesk("d1", [2000, 1500], { label: "A-01" })],
  }) as unknown as ApiPlan;

  it("draws a raised item above the desk under it", () => {
    const { store } = editing(plan);
    expect(store.getState().plan?.objectOrder).toEqual(["d1", "s1"]);
  });

  it("selects the raised item where it overlaps, and the desk around it", () => {
    const { store, click } = editing(plan);
    click([2000, 1500]);
    expect([...store.getState().selection]).toEqual(["s1"]);
    click([1300, 1500]); // the desk is 1600 wide, the screen 600
    expect([...store.getState().selection]).toEqual(["d1"]);
  });

  it("keeps the order up to date when an item is lowered to the floor", () => {
    const { store } = editing(plan);
    store
      .getState()
      .perform([{ op: "update", kind: "object", id: "s1", data: { position: [2000, 1500, 0] } }]);
    expect(store.getState().plan?.objectOrder).toEqual(["s1", "d1"]);
  });
});
