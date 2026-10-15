// @vitest-environment jsdom
/** Heights on the drawn plan (docs/0095): dashed raised items, height tags, the filter. */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import i18n from "@/i18n";
import { createEditorStore } from "@/editor/core/store";
import type { ApiPlan } from "@/editor/core/operations";
import { ViewerInteraction } from "@/editor/core/viewerInteraction";
import { STUB_MONITOR_ITEM, stubDesk, stubDoor, stubPlan, stubWall } from "@/test/stubs";

import { PlanCanvas } from "./PlanCanvas";

const ZONE_TYPES = new Map<string, { name: string; color: string }>();

function show(objects: object[]) {
  const store = createEditorStore();
  store.getState().loadDocument(
    stubPlan({
      walls: [stubWall("w1", [0, 0], [4000, 0])],
      openings: [stubDoor("win", "w1", 1000, { type: "window", sill_mm: 900, height_mm: 1200 })],
      objects,
    }) as unknown as ApiPlan,
    ZONE_TYPES,
  );
  const { container } = render(
    <PlanCanvas store={store} view={{ interaction: new ViewerInteraction(store) }} />,
  );
  return { store, svg: container.querySelector("svg[data-lod]")! };
}

const hung = {
  ...stubDesk("s1", [2000, 1500]),
  catalog_item_rev_id: STUB_MONITOR_ITEM.id,
  position: [2000, 1500, 1400],
  allocation_mode: null,
};

afterEach(cleanup);

describe("heights on the plan", () => {
  it("draws a raised item dashed, with its height range", async () => {
    await i18n.changeLanguage("en");
    const { svg } = show([hung, stubDesk("d1", [2000, 3000])]);
    expect(svg.querySelector("#e-s1")).toHaveAttribute("stroke-dasharray");
    expect(svg.querySelector("#e-d1")).not.toHaveAttribute("stroke-dasharray");
    expect(svg.querySelector("#h-s1")).toHaveTextContent("1.40–1.85");
    expect(svg.querySelector("#h-d1")).toBeNull();
  });

  it("tags a window from sill to top", async () => {
    await i18n.changeLanguage("en");
    const { svg } = show([]);
    expect(svg.querySelector("#h-win")).toHaveTextContent("0.90–2.10");
  });

  it("offers the filter only when something is raised, and fades the other group", async () => {
    await i18n.changeLanguage("en");
    show([stubDesk("d1", [2000, 3000])]);
    expect(screen.queryByRole("group", { name: "Height" })).toBeNull();
    cleanup();

    const { svg } = show([hung, stubDesk("d1", [2000, 3000])]);
    const filter = screen.getByRole("group", { name: "Height" });
    expect(svg).toHaveAttribute("data-height", "all");
    await userEvent.click(within(filter).getByRole("button", { name: "Raised" }));
    expect(svg).toHaveAttribute("data-height", "raised");
    expect(within(filter).getByRole("button", { name: "Raised" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // The CSS fades the floor group; the shapes carry the class it targets.
    expect(svg.querySelector("#e-d1")).toHaveClass("plan-floor");
    expect(svg.querySelector("#e-s1")).toHaveClass("plan-raised");
  });
});
