import { describe, expect, it } from "vitest";

import type { ApiPlan } from "./operations";
import { createEditorStore } from "./store";

const DESK = {
  id: "d1",
  catalog_item_rev_id: "rev",
  position: [1000, 1000, 0],
  rotation_ddeg: 0,
  label: "A-01",
  attached_to: null,
  allocation_mode: "assigned",
};
const PLAN = {
  floor_id: "f",
  version: 1,
  state: "draft",
  revision: 1,
  walls: [],
  openings: [],
  columns: [],
  zones: [],
  objects: [DESK],
  catalog: {
    rev: {
      id: "rev",
      key: "desk",
      category: "desk",
      shape: "box",
      width_mm: 1600,
      depth_mm: 800,
      height_mm: 740,
      color: null,
      is_seat: true,
    },
  },
} as unknown as ApiPlan;

function editing() {
  const store = createEditorStore();
  store.getState().loadDocument(PLAN, new Map());
  return store;
}

const x = (store: ReturnType<typeof editing>) => store.getState().plan?.objects.d1?.position[0];

describe("edit history (docs/0050)", () => {
  it("a drag is one undo step; undo and redo move the desk and queue the changes", () => {
    const store = editing();
    const s = store.getState();
    s.select(["d1"]);
    s.setDrag({ dx: 500, dy: 0 });
    s.commitDrag();
    expect(x(store)).toBe(1500);
    expect(store.getState().undoStack).toHaveLength(1);

    store.getState().undo();
    expect(x(store)).toBe(1000);
    store.getState().redo();
    expect(x(store)).toBe(1500);
    // The server gets the move, its undo and its redo, in order.
    expect(
      store
        .getState()
        .takeOutbox()
        .map((op) => ("data" in op ? op.data : null)),
    ).toEqual([
      { position: [1500, 1000, 0] },
      { position: [1000, 1000, 0] },
      { position: [1500, 1000, 0] },
    ]);
    expect(store.getState().outbox).toEqual([]);
  });

  it("a new action clears redo; nothing to undo does nothing", () => {
    const store = editing();
    store.getState().undo();
    expect(store.getState().outbox).toEqual([]);
    store.getState().perform([{ op: "update", kind: "object", id: "d1", data: { label: "B" } }]);
    store.getState().undo();
    store.getState().perform([{ op: "update", kind: "object", id: "d1", data: { label: "C" } }]);
    expect(store.getState().redoStack).toEqual([]);
    expect(store.getState().plan?.objects.d1?.label).toBe("C");
  });

  it("deleting a selected desk clears it from the selection", () => {
    const store = editing();
    store.getState().select(["d1"]);
    store.getState().perform([{ op: "delete", kind: "object", id: "d1" }]);
    expect(store.getState().selection.size).toBe(0);
  });

  it("operations that failed to send go back to the front of the outbox", () => {
    const store = editing();
    store.getState().perform([{ op: "update", kind: "object", id: "d1", data: { label: "B" } }]);
    const sent = store.getState().takeOutbox();
    store.getState().perform([{ op: "update", kind: "object", id: "d1", data: { label: "C" } }]);
    store.getState().returnToOutbox(sent);
    expect(store.getState().outbox.map((op) => ("data" in op ? op.data : null))).toEqual([
      { label: "B" },
      { label: "C" },
    ]);
  });
});
