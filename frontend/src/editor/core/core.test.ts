import { describe, expect, it } from "vitest";

import { generateFloor } from "./bench/generateFloor";
import { buildHitIndex, hitTest, moveObjects, withAttachments } from "./hitTest";
import { Interaction } from "./interaction";
import type { Plan, Wall } from "./plan";
import { createEditorStore } from "./store";
import { panBy, planToScreen, screenToPlan, viewBox, zoomAt } from "./viewport";
import { wallChains } from "./walls";

const firstDesk = (plan: Plan) => {
  const id = plan.objectOrder.find((i) => plan.objects[i]?.catalog_item_rev_id === "desk");
  const desk = id ? plan.objects[id] : undefined;
  if (!desk) throw new Error("no desk");
  return desk;
};

describe("generateFloor", () => {
  it("produces exactly the requested seats, each with chair, two monitors and a label", () => {
    const { plan, stats } = generateFloor({ seats: 1500 });
    expect(stats.seats).toBe(1500);
    expect(stats.objects).toBe(1500 * 4);
    const labels = plan.objectOrder.filter((id) => plan.objects[id]?.label);
    expect(labels).toHaveLength(1500);
  });

  it("is deterministic and uses whole millimetres only (docs/0029)", () => {
    const a = generateFloor({ seats: 100 }).plan;
    const b = generateFloor({ seats: 100 }).plan;
    expect(a).toEqual(b);
    for (const o of Object.values(a.objects)) {
      expect(o.position.every(Number.isInteger)).toBe(true);
    }
    for (const w of a.walls) expect([...w.a, ...w.b].every(Number.isInteger)).toBe(true);
  });
});

describe("wallChains", () => {
  const w = (id: string, a: [number, number], b: [number, number], t = 100): Wall => ({
    id,
    a,
    b,
    thickness_mm: t,
    height_mm: 2800,
  });

  it("chains a closed rectangle into one closed loop", () => {
    const chains = wallChains([
      w("1", [0, 0], [10, 0]),
      w("2", [10, 0], [10, 10]),
      w("3", [10, 10], [0, 10]),
      w("4", [0, 10], [0, 0]),
    ]);
    expect(chains).toHaveLength(1);
    expect(chains[0]?.closed).toBe(true);
    expect(chains[0]?.points).toHaveLength(4);
  });

  it("chains an open L regardless of input order, and breaks at T-junctions", () => {
    expect(wallChains([w("2", [10, 0], [10, 10]), w("1", [0, 0], [10, 0])])).toEqual([
      {
        thickness_mm: 100,
        points: [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
        closed: false,
      },
    ]);
    // A T: three walls meet at (10,0) -> no chaining.
    const t = wallChains([
      w("1", [0, 0], [10, 0]),
      w("2", [10, 0], [20, 0]),
      w("3", [10, 0], [10, 10]),
    ]);
    expect(t).toHaveLength(3);
  });

  it("does not chain walls of different thickness", () => {
    expect(wallChains([w("1", [0, 0], [10, 0], 100), w("2", [10, 0], [10, 10], 300)])).toHaveLength(
      2,
    );
  });
});

describe("hit-testing (docs/0052)", () => {
  const { plan } = generateFloor({ seats: 12 });
  const index = buildHitIndex(plan);

  it("hits a desk at its centre and nothing in the empty margin", () => {
    const desk = firstDesk(plan);
    expect(hitTest(plan, index, [desk.position[0], desk.position[1] - 300])).toEqual({
      kind: "object",
      id: desk.id,
    });
    expect(hitTest(plan, index, [1500, 1500])).toBeNull();
  });

  it("prefers attached objects (monitors) over the desk under them", () => {
    const monitorId = plan.objectOrder.find((i) => plan.objects[i]?.attached_to);
    const monitor = monitorId ? plan.objects[monitorId] : undefined;
    expect(monitor).toBeDefined();
    expect(hitTest(plan, index, [monitor!.position[0], monitor!.position[1]])?.id).toBe(monitorId);
  });

  it("hits walls within half their thickness", () => {
    expect(hitTest(plan, index, [5000, 100])?.kind).toBe("wall");
  });

  it("selecting a desk includes its attached monitors", () => {
    const desk = firstDesk(plan);
    expect(withAttachments(plan, [desk.id]).size).toBe(3);
  });

  it("moving keeps whole millimetres and leaves other objects untouched (same identity)", () => {
    const desk = firstDesk(plan);
    const moved = moveObjects(plan, new Set([desk.id]), 10.4, -5.6);
    expect(moved.objects[desk.id]?.position.slice(0, 2)).toEqual([
      desk.position[0] + 10,
      desk.position[1] - 6,
    ]);
    const other = plan.objectOrder.find((i) => i !== desk.id)!;
    expect(moved.objects[other]).toBe(plan.objects[other]);
  });
});

describe("viewport", () => {
  const v = { cx: 5000, cy: 3000, mmPerPx: 10 };
  const size = [800, 600] as const;

  it("round-trips screen and plan coordinates with y flipped", () => {
    expect(screenToPlan(v, size, 400, 300)).toEqual([5000, 3000]);
    expect(screenToPlan(v, size, 400, 0)).toEqual([5000, 6000]); // top of screen = north
    const p = [6234, 1500] as const;
    const back = screenToPlan(v, size, ...planToScreen(v, size, p));
    expect(back[0]).toBeCloseTo(p[0]);
    expect(back[1]).toBeCloseTo(p[1]);
  });

  it("zooms around the cursor and pans by pixels", () => {
    const z = zoomAt(v, size, 100, 100, 2);
    expect(z.mmPerPx).toBe(5);
    expect(screenToPlan(z, size, 100, 100)).toEqual(screenToPlan(v, size, 100, 100));
    expect(panBy(v, 10, 0).cx).toBe(4900);
    expect(viewBox(v, size)).toEqual([1000, -6000, 8000, 6000]);
  });
});

describe("Interaction (headless, docs/0052)", () => {
  it("click selects a desk with its monitors, drag moves on the 5 cm grid, empty click clears", () => {
    const store = createEditorStore();
    const { plan } = generateFloor({ seats: 6 });
    store.getState().loadPlan(plan);
    store.getState().setViewport({ cx: 0, cy: 0, mmPerPx: 10 });
    const ui = new Interaction(store);
    ui.setSize(1000, 1000);
    const desk = firstDesk(plan);
    const at = planToScreen(
      store.getState().viewport,
      [1000, 1000],
      [desk.position[0], desk.position[1] - 300],
    );

    expect(ui.pointerDown({ sx: at[0], sy: at[1], button: 0, shift: false })).toBe("select");
    expect(store.getState().selection.size).toBe(3);
    ui.pointerMove({ sx: at[0] + 10.3, sy: at[1], button: 0, shift: false }); // +103 mm
    expect(store.getState().drag).toEqual({ dx: 100, dy: 0 }); // snapped to 50 mm grid
    ui.pointerUp({ sx: at[0] + 10.3, sy: at[1], button: 0, shift: false });
    expect(store.getState().plan?.objects[desk.id]?.position[0]).toBe(desk.position[0] + 100);

    const empty = planToScreen(store.getState().viewport, [1000, 1000], [1500, 1500]);
    ui.pointerDown({ sx: empty[0], sy: empty[1], button: 0, shift: false });
    ui.pointerUp({ sx: empty[0], sy: empty[1], button: 0, shift: false });
    expect(store.getState().selection.size).toBe(0);
  });
});
