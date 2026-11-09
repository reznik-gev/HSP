// @vitest-environment jsdom
/** What's being dragged is drawn where it's going, turned as it will be. */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { createEditorStore } from "@/editor/core/store";
import type { ApiPlan } from "@/editor/core/operations";
import { ViewerInteraction } from "@/editor/core/viewerInteraction";
import { stubDesk, stubPlan } from "@/test/stubs";

import { PlanCanvas } from "./PlanCanvas";

/** One desk d1 at (2000, 1500), not turned. */
const ONE_DESK = stubPlan({ objects: [stubDesk("d1", [2000, 1500])] }) as unknown as ApiPlan;

function show(plan: ApiPlan) {
  const store = createEditorStore();
  store.getState().loadDocument(plan, new Map());
  const { container } = render(
    <PlanCanvas store={store} view={{ interaction: new ViewerInteraction(store) }} />,
  );
  return { store, svg: container.querySelector("svg[data-lod]")! };
}

afterEach(cleanup);

describe("dragging on the plan", () => {
  it("draws a desk turned by R mid-drag where it is, offset by the drag", () => {
    const { store, svg } = show(ONE_DESK);
    act(() => {
      store.getState().select(["d1"]);
      store.getState().setDrag({ dx: 500, dy: 0, spin: 900 });
    });
    const shape = svg.querySelector(".plan-selected")!;
    expect(shape).toHaveAttribute("transform", "translate(2000 1500) rotate(90)");
    expect(shape.closest("g[transform]")).toHaveAttribute("transform", "translate(500 0)");
  });
});
