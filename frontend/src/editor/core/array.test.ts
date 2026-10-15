import { describe, expect, it } from "vitest";

import { arrayLayout, arrayOps, selectionBox } from "./array";
import { applyOps } from "./operations";
import { editing } from "./testPlan";

// The test plan's desk d1 (160 × 80 cm, facing north) at (2000,1500) with monitor m1 on it at
// (2000,1700).
const doc = () => editing().store.getState().document!;
const D1 = new Set(["d1"]);

describe("arrays (docs/0049)", () => {
  it("the default spacing is the selection's size", () => {
    expect(selectionBox(doc(), D1)).toMatchObject({ width: 1600, depth: 800 });
  });

  it("rows × columns at a spacing; the originals stay put", () => {
    const layout = arrayLayout(doc(), D1, {
      rows: 2,
      columns: 3,
      dx: 1600,
      dy: 1800,
      mirror: false,
    });
    // 2 × 3 − 1 copies of the desk and its monitor.
    expect(layout).toHaveLength(10);
    expect(layout.filter((c) => c.sourceId === "d1").map((c) => c.position)).toEqual([
      [3600, 1500],
      [5200, 1500],
      [2000, 3300],
      [3600, 3300],
      [5200, 3300],
    ]);
  });

  it("mirrored rows face the other way: back-to-back desks", () => {
    const layout = arrayLayout(doc(), D1, { rows: 2, columns: 1, dx: 1600, dy: 800, mirror: true });
    // The group's outline runs from y = 1100 to 1900 (monitor included at 1700 ± 100),
    // centre 1500: the desk stays at 1500 + 800, the monitor flips to its south side.
    expect(layout).toEqual([
      { sourceId: "d1", position: [2000, 2300], rotation_ddeg: 1800 },
      { sourceId: "m1", position: [2000, 2100], rotation_ddeg: 1800 },
    ]);
  });

  it("copies are new items: no seat label, no device, monitors on their own copied desk", () => {
    const d = doc();
    const { ops, ids } = arrayOps(d, D1, { rows: 1, columns: 2, dx: 1600, dy: 0, mirror: false });
    expect(ids).toHaveLength(2);
    const after = applyOps(d, ops).plan;
    const [desk, monitor] = ids.map((id) => after.objects.find((o) => o.id === id)!);
    expect(desk).toMatchObject({ label: null, device_id: null, allocation_mode: "assigned" });
    expect(monitor).toMatchObject({ attached_to: desk!.id, position: [3600, 1700, 740] });
  });
});
