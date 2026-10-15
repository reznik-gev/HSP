import { describe, expect, it } from "vitest";

import { stubPlan, stubDesk, stubMonitor, stubWall, stubZone } from "@/test/stubs";

import { isSeat, planBounds, planFromApi } from "./fromApi";
import { createEditorStore } from "./store";
import { ViewerInteraction } from "./viewerInteraction";

const API_PLAN = stubPlan({
  version: 2,
  state: "published",
  walls: [stubWall("w1", [0, 0], [10000, 0], { thickness_mm: 200 })],
  columns: [
    {
      id: "c1",
      footprint: [
        [0, 0],
        [400, 0],
        [400, 400],
        [0, 400],
      ],
      height_mm: 3000,
    },
  ],
  zones: [
    stubZone(
      "z1",
      [
        [0, 0],
        [5000, 0],
        [5000, 5000],
      ],
      { name: "Pod" },
    ),
  ],
  // The monitor comes first on purpose: attached items are drawn after their hosts.
  objects: [
    stubMonitor("mon", "desk", [3000, 3000]),
    stubDesk("desk", [3000, 3000], { label: "A-01" }),
  ],
});

function setup() {
  const plan = planFromApi(
    API_PLAN as never,
    new Map([["zt1", { name: "Pod", color: "#86efac" }]]),
  );
  const store = createEditorStore();
  store.getState().loadPlan(plan);
  // 1 mm per px, plan point (0,0) at the screen centre of a 1000x1000 canvas.
  store.getState().setViewport({ cx: 0, cy: 0, mmPerPx: 10 });
  const viewer = new ViewerInteraction(store);
  viewer.setSize(1000, 1000);
  return { plan, store, viewer };
}

// Screen point for plan (3000, 3000) at 10 mm/px around the centre: (800, 200).
const ON_DESK = { sx: 800, sy: 200, button: 0, shift: false };

describe("plan viewer core (docs/0087)", () => {
  it("converts the API plan: zone colours, seat mode, monitors drawn on top", () => {
    const { plan } = setup();
    expect(plan.zones[0]?.color).toBe("#86efac");
    expect(plan.objects.desk?.allocation_mode).toBe("assigned");
    expect(plan.objectOrder).toEqual(["desk", "mon"]);
    expect(plan.catalog["rev-desk"]?.color).toBe("#e7e2d9"); // category fallback
    expect(isSeat(plan, "desk")).toBe(true);
    expect(isSeat(plan, "mon")).toBe(false);
    expect(planBounds(plan)).toEqual({ minX: -500, minY: -500, maxX: 10500, maxY: 5500 });
  });

  it("a click on the monitor selects the desk it stands on; a click elsewhere clears", () => {
    const { store, viewer } = setup();
    expect(viewer.seatAt(ON_DESK.sx, ON_DESK.sy)).toBe("desk");
    viewer.pointerDown(ON_DESK);
    viewer.pointerUp(ON_DESK);
    expect([...store.getState().selection]).toContain("desk");
    viewer.pointerDown({ ...ON_DESK, sx: 100 });
    viewer.pointerUp({ ...ON_DESK, sx: 100 });
    expect(store.getState().selection.size).toBe(0);
  });

  it("dragging pans and never moves anything", () => {
    const { store, viewer } = setup();
    viewer.pointerDown(ON_DESK);
    viewer.pointerMove({ ...ON_DESK, sx: ON_DESK.sx + 50 });
    viewer.pointerUp({ ...ON_DESK, sx: ON_DESK.sx + 50 });
    expect(store.getState().viewport.cx).toBe(-500);
    expect(store.getState().selection.size).toBe(0);
    expect(store.getState().plan?.objects.desk?.position).toEqual([3000, 3000, 0]);
  });
});
