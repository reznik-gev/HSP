import { describe, expect, it } from "vitest";

import { stubPlan, stubDesk } from "@/test/stubs";

import type { ApiPlan, Op } from "./operations";
import { createEditorStore } from "./store";

const WALL = { a: [0, 0], b: [3000, 0], thickness_mm: 150, height_mm: 3000 };
const dataOf = (ops: Op[]) => ops.map((op) => ("data" in op ? op.data : null));

const PLAN = stubPlan({
  objects: [stubDesk("d1", [1000, 1000], { label: "A-01" })],
}) as unknown as ApiPlan;

function editing() {
  const store = createEditorStore();
  store.getState().loadDocument(PLAN, new Map());
  return store;
}

const x = (store: ReturnType<typeof editing>) => store.getState().plan?.objects.d1?.position[0];

describe("edit history (docs/0050)", () => {
  it("a drag is one undo step; undo and redo move the stubDesk and queue the changes", () => {
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
    // The server gets the move, its undo and its redo, in order, one change each.
    expect(store.getState().pending.map((c) => [c.origin, dataOf(c.ops)])).toEqual([
      ["do", [{ position: [1500, 1000, 0] }]],
      ["undo", [{ position: [1000, 1000, 0] }]],
      ["redo", [{ position: [1500, 1000, 0] }]],
    ]);
    store.getState().confirmFirst();
    expect(store.getState().pending).toHaveLength(2);
  });

  it("a new action clears redo; nothing to undo does nothing", () => {
    const store = editing();
    store.getState().undo();
    expect(store.getState().pending).toEqual([]);
    store.getState().perform([{ op: "update", kind: "object", id: "d1", data: { label: "B" } }]);
    store.getState().undo();
    store.getState().perform([{ op: "update", kind: "object", id: "d1", data: { label: "C" } }]);
    expect(store.getState().redoStack).toEqual([]);
    expect(store.getState().plan?.objects.d1?.label).toBe("C");
  });

  it("deleting a selected stubDesk clears it from the selection", () => {
    const store = editing();
    store.getState().select(["d1"]);
    store.getState().perform([{ op: "delete", kind: "object", id: "d1" }]);
    expect(store.getState().selection.size).toBe(0);
  });

  it("a refused change is taken back; later changes that don't need it stay (docs/0090)", () => {
    const store = editing();
    const s = () => store.getState();
    s().perform([{ op: "update", kind: "object", id: "d1", data: { label: "B" } }]);
    s().perform([{ op: "add", kind: "wall", id: "w9", data: WALL }]);
    s().perform([{ op: "update", kind: "object", id: "d1", data: { rotation_ddeg: 900 } }]);
    const taken = s().rejectFirst();
    expect(taken?.rejected.ops[0]).toMatchObject({ data: { label: "B" } });
    expect(taken?.dropped).toEqual([]);
    expect(s().plan?.objects.d1).toMatchObject({ label: "A-01", rotation_ddeg: 900 });
    expect(s().plan?.walls.map((w) => w.id)).toEqual(["w9"]);
    // Gone from the history too: undo now takes back the rotation, then the wall.
    expect(s().undoStack).toHaveLength(2);
    expect(s().pending.map((c) => dataOf(c.ops))).toEqual([[WALL], [{ rotation_ddeg: 900 }]]);
  });

  it("later changes to an element whose adding was refused go with it", () => {
    const store = editing();
    const s = () => store.getState();
    s().perform([{ op: "add", kind: "wall", id: "w9", data: WALL }]);
    s().perform([{ op: "update", kind: "wall", id: "w9", data: { height_mm: 2700 } }]);
    s().perform([{ op: "update", kind: "object", id: "d1", data: { label: "B" } }]);
    const taken = s().rejectFirst();
    expect(taken?.dropped).toHaveLength(1);
    expect(s().plan?.walls).toEqual([]);
    expect(s().plan?.objects.d1?.label).toBe("B");
    expect(s().undoStack).toHaveLength(1);
  });
});
