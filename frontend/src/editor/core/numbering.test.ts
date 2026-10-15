import { describe, expect, it } from "vitest";

import { stubDesk, stubPlan } from "@/test/stubs";

import { floorLabels, labelFor, nextFree, parsePattern } from "./numbering";
import type { ApiPlan } from "./operations";
import { editing } from "./testPlan";

// Three desks in a row, 2 m apart, labels A-01 (west) and none for the others.
const ROW = stubPlan({
  objects: [
    stubDesk("d1", [0, 0], { label: "A-01" }),
    stubDesk("d2", [2000, 0]),
    stubDesk("d3", [4000, 0]),
  ],
}) as unknown as ApiPlan;

describe("numbering patterns (docs/0049)", () => {
  it("one counter in braces gives the first number and the padding", () => {
    const p = parsePattern("HT-3-{01}")!;
    expect(p).toEqual({ before: "HT-3-", after: "", start: 1, width: 2 });
    expect([labelFor(p, 1), labelFor(p, 12), labelFor(p, 123)]).toEqual([
      "HT-3-01",
      "HT-3-12",
      "HT-3-123",
    ]);
    expect(labelFor(parsePattern("{100}B")!, 101)).toBe("101B");
    expect(parsePattern("HT-3-01")).toBeNull();
    expect(parsePattern("{1}-{1}")).toBeNull();
  });

  it("skips labels that are taken", () => {
    const p = parsePattern("A-{01}")!;
    expect(nextFree(p, 1, new Set(["A-01", "A-02"]))).toEqual({ label: "A-03", n: 3 });
  });
});

describe("the numbering tool", () => {
  function numbering() {
    const e = editing(ROW);
    e.store.getState().setTool("number");
    e.store.getState().setNumbering({ pattern: "A-{01}" });
    return e;
  }

  it("clicking seats numbers them in click order, skipping labels in use on the floor", () => {
    const { store, click } = numbering();
    click([4000, 0]);
    click([2000, 0]);
    // A-01 is d1's: the first new label is A-02.
    expect(floorLabels(store.getState().plan!)).toEqual(new Set(["A-01", "A-02", "A-03"]));
    expect(store.getState().plan!.objects.d3!.label).toBe("A-02");
    expect(store.getState().plan!.objects.d2!.label).toBe("A-03");
    expect(store.getState().undoStack).toHaveLength(2);
  });

  it("dragging across seats numbers them as one step, and skips the building's other labels", () => {
    const { store, interaction, at } = numbering();
    store.getState().setTakenLabels(new Set(["A-02"])); // on another floor
    store.getState().setNumbering({ pattern: "A-{01}" });
    const press = { button: 0, shift: false };
    interaction.pointerDown({ ...at([0, 0]), ...press });
    interaction.pointerMove({ ...at([2000, 0]), ...press });
    interaction.pointerMove({ ...at([2100, 0]), ...press }); // the same desk again: once only
    expect(store.getState().preview).toMatchObject({
      kind: "numbering",
      seats: [
        { id: "d1", label: "A-01" },
        { id: "d2", label: "A-03" },
      ],
    });
    interaction.pointerMove({ ...at([4000, 0]), ...press });
    interaction.pointerUp({ ...at([4000, 0]), ...press });
    const o = store.getState().plan!.objects;
    expect([o.d1!.label, o.d2!.label, o.d3!.label]).toEqual(["A-01", "A-03", "A-04"]);
    expect(store.getState().undoStack).toHaveLength(1);
    expect(store.getState().numbering.next).toBe(5);
  });

  it("a new pattern starts its counter over", () => {
    const { store } = numbering();
    store.getState().setNumbering({ next: 9 });
    store.getState().setNumbering({ pattern: "B-{100}" });
    expect(store.getState().numbering).toEqual({ pattern: "B-{100}", next: 100 });
  });
});
