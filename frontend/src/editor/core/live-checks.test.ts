import { describe, expect, it } from "vitest";

import { editing } from "./testPlan";

// The test plan is valid: walls, a door that fits, a desk with its monitor.
describe("live checks (docs/0051)", () => {
  it("findings follow the plan: they appear with a change and go with its undo", () => {
    const { store } = editing();
    expect(store.getState().findings).toEqual([]);
    store
      .getState()
      .perform([{ op: "update", kind: "opening", id: "o1", data: { offset_mm: 3500 } }]);
    expect(store.getState().findings).toEqual([
      { code: "opening_exceeds_wall", severity: "error", elementId: "o1" },
    ]);
    store.getState().undo();
    expect(store.getState().findings).toEqual([]);
  });
});
