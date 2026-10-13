import { describe, expect, it } from "vitest";

import { isSeat, planBounds, planFromApi } from "./fromApi";
import { createEditorStore } from "./store";
import { ViewerInteraction } from "./viewerInteraction";

const DESK = {
  id: "rev-desk",
  item_id: "i1",
  key: "desk",
  category: "desk",
  name: "Desk",
  shape: "box" as const,
  width_mm: 1600,
  depth_mm: 800,
  height_mm: 740,
  color: null,
  is_seat: true,
  mountable: false,
  attaches_to_categories: [],
  footprint_blocks: true,
};
const MONITOR = {
  ...DESK,
  id: "rev-mon",
  key: "monitor",
  category: "monitor",
  width_mm: 600,
  depth_mm: 200,
  is_seat: false,
};

const API_PLAN = {
  floor_id: "f1",
  version: 2,
  state: "published" as const,
  revision: 1,
  walls: [{ id: "w1", a: [0, 0], b: [10000, 0], thickness_mm: 200, height_mm: 3000 }],
  openings: [],
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
    {
      id: "z1",
      name: "Pod",
      zone_type_id: "zt1",
      parent_zone_id: null,
      boundary: [
        [0, 0],
        [5000, 0],
        [5000, 5000],
      ],
    },
  ],
  objects: [
    {
      id: "mon",
      catalog_item_rev_id: "rev-mon",
      position: [3000, 3000, 740],
      rotation_ddeg: 0,
      attached_to: "desk",
    },
    {
      id: "desk",
      catalog_item_rev_id: "rev-desk",
      position: [3000, 3000, 0],
      rotation_ddeg: 0,
      label: "A-01",
      allocation_mode: "assigned" as const,
    },
  ],
  catalog: { "rev-desk": DESK, "rev-mon": MONITOR },
};

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
