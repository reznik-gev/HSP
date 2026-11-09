import { describe, expect, it } from "vitest";

import { stubDesk, stubPlan } from "@/test/stubs";

import type { PlanCatalogItem } from "./edits";
import type { ApiPlan } from "./operations";
import type { Vec2 } from "./plan";
import { STUB_DESK_ITEM, editing } from "./testPlan";

// The test plan: w1 (0,0)→(4000,0) meets w2 (4000,0)→(4000,3000); desk d1 at (2000,1500)
// with monitor m1 on it.

/** Two desks on their own: d1 at (1000, 1500) and d2 at (-1000, 1500). */
const TWO_DESKS = stubPlan({
  objects: [stubDesk("d1", [1000, 1500]), stubDesk("d2", [-1000, 1500])],
}) as unknown as ApiPlan;

type Editing = ReturnType<typeof editing>;

/**
 * Where an object is shown and how it's turned: where it's being dragged to, while a drag is
 * on, as the plan view draws it.
 */
function shown({ store }: Editing, id: string): { at: Vec2; rotation_ddeg: number } {
  const { plan, drag } = store.getState();
  const o = plan!.objects[id]!;
  let at: Vec2 = [o.position[0], o.position[1]];
  let rotation_ddeg = o.rotation_ddeg;
  if (drag) {
    rotation_ddeg += drag.spin ?? 0;
    if (drag.turn) {
      const { ddeg, pivot } = drag.turn;
      const a = (ddeg / 10) * (Math.PI / 180);
      const [x, y] = [at[0] - pivot[0], at[1] - pivot[1]];
      at = [
        pivot[0] + x * Math.cos(a) - y * Math.sin(a),
        pivot[1] + x * Math.sin(a) + y * Math.cos(a),
      ];
      rotation_ddeg += ddeg;
    }
    at = [Math.round(at[0] + drag.dx), Math.round(at[1] + drag.dy)];
  }
  return { at, rotation_ddeg: ((rotation_ddeg % 3600) + 3600) % 3600 };
}

describe("R while dragging", () => {
  it("turns the dragged item where it is now, and the drag carries on", () => {
    const e = editing();
    const { store, interaction, at } = e;
    interaction.pointerDown(at([2000, 1500])); // the desk, with its monitor
    interaction.pointerMove(at([-2000, -2000]));
    interaction.key("r");
    // It stays where it was dragged, turned a quarter.
    expect(shown(e, "d1")).toEqual({ at: [-2000, -2000], rotation_ddeg: 900 });
    expect(shown(e, "m1")).toMatchObject({ rotation_ddeg: 900 });
    // Nothing is saved until the drag ends.
    expect(store.getState().undoStack).toHaveLength(0);

    // Moving again carries on from there, still turned.
    interaction.pointerMove(at([-1000, -2000]));
    expect(shown(e, "d1")).toEqual({ at: [-1000, -2000], rotation_ddeg: 900 });
    interaction.key("R");
    expect(shown(e, "d1")).toEqual({ at: [-1000, -2000], rotation_ddeg: 1800 });

    interaction.pointerUp(at([-1000, -2000]));
    const objects = store.getState().plan!.objects;
    expect(objects.d1).toMatchObject({ position: [-1000, -2000, 0], rotation_ddeg: 1800 });
    expect(objects.m1).toMatchObject({ rotation_ddeg: 1800 });
    // The move and the turns are one step to undo.
    expect(store.getState().undoStack).toHaveLength(1);
  });

  it("turns each of several dragged objects where it is now", () => {
    const e = editing(TWO_DESKS);
    const { store, interaction, click, at } = e;
    click([1000, 1500]);
    click([-1000, 1500], { shift: true });
    interaction.pointerDown(at([1000, 1500]));
    interaction.pointerMove(at([1000, -1500]));
    interaction.key("r");
    expect(shown(e, "d1")).toEqual({ at: [1000, -1500], rotation_ddeg: 900 });
    expect(shown(e, "d2")).toEqual({ at: [-1000, -1500], rotation_ddeg: 900 });

    interaction.pointerMove(at([1500, -1500]));
    interaction.pointerUp(at([1500, -1500]));
    const objects = store.getState().plan!.objects;
    expect(objects.d1).toMatchObject({ position: [1500, -1500, 0], rotation_ddeg: 900 });
    expect(objects.d2).toMatchObject({ position: [-500, -1500, 0], rotation_ddeg: 900 });
    expect(store.getState().undoStack).toHaveLength(1);
  });

  it("the item tool's preview turns where it is", () => {
    const { store, interaction, at } = editing();
    store.getState().setTool("item");
    store.getState().setPlacing(STUB_DESK_ITEM as unknown as PlanCatalogItem);
    interaction.pointerMove(at([-3000, -3000]));
    interaction.key("r");
    expect(store.getState().preview).toMatchObject({
      kind: "item",
      at: [-3000, -3000],
      rotation_ddeg: 900,
    });
  });
});
