import { describe, expect, it } from "vitest";

import type { PlanCatalogItem } from "./edits";
import { DESK_ITEM, editing } from "./testPlan";

const CHAIR = {
  ...DESK_ITEM,
  id: "rev-chair",
  item_id: "chair",
  key: "task_chair",
  category: "chair",
  name: "Task chair",
  shape: "cylinder",
  width_mm: 600,
  depth_mm: 600,
  is_seat: false,
} as unknown as PlanCatalogItem;

describe("the item tool (docs/0021, docs/0089)", () => {
  it("places the chosen item where clicked; seats start as assigned, others without a mode", () => {
    const { store, click } = editing();
    store.getState().setTool("item");
    click([-3000, -3000]); // nothing chosen yet: nothing happens
    expect(store.getState().undoStack).toHaveLength(0);

    store.getState().setPlacing(CHAIR);
    click([-3010, -2990]);
    const doc = store.getState().document!;
    expect(doc.catalog["rev-chair"]).toMatchObject({ name: "Task chair" });
    expect(doc.objects.at(-1)).toMatchObject({
      catalog_item_rev_id: "rev-chair",
      position: [-3000, -3000, 0],
      rotation_ddeg: 0,
      label: null,
      allocation_mode: null,
    });
    store.getState().setPlacing(DESK_ITEM as unknown as PlanCatalogItem);
    click([-1000, -3000]);
    expect(store.getState().document!.objects.at(-1)).toMatchObject({
      allocation_mode: "assigned",
    });
  });

  it("R turns the item being placed, a quarter at a time", () => {
    const { store, interaction, click, at } = editing();
    store.getState().setTool("item");
    store.getState().setPlacing(CHAIR);
    interaction.pointerMove(at([-3000, -3000]));
    interaction.key("r");
    expect(store.getState().preview).toMatchObject({ kind: "item", rotation_ddeg: 900 });
    click([-3000, -3000]);
    expect(store.getState().document!.objects.at(-1)).toMatchObject({ rotation_ddeg: 900 });
  });

  it("R turns the selected furniture too, as one undo step", () => {
    const { store, interaction, click } = editing();
    click([2000, 1500]); // the desk (and its monitor)
    interaction.key("R");
    const objects = store.getState().plan!.objects;
    expect(objects.d1!.rotation_ddeg).toBe(900);
    expect(objects.m1!.rotation_ddeg).toBe(900);
    expect(store.getState().undoStack).toHaveLength(1);
  });
});
