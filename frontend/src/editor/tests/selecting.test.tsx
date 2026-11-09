// @vitest-environment jsdom
/** Selecting with a rectangle: Shift+drag in Select (docs/0133). */
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { spyChangesets, stubEditorRoutes } from "@/test/editorStubs";
import { dragOnPlan, releaseOnPlan } from "@/test/planPointer";
import { renderApp } from "@/test/renderApp";

afterEach(cleanup);

// Floor 3's draft: wall w1 from (0, 0) to (8000, 0), and desk d1 (160 × 80 cm) at (2000, 1000).
describe("selecting with a rectangle (docs/0133)", () => {
  it("Shift+drag draws a rectangle and selects what's inside it when you let go", async () => {
    const { routes, changesets } = spyChangesets();
    await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");

    // Starting on the desk: a rectangle, not a move.
    dragOnPlan([2000, 1000], [-200, -300], { shiftKey: true, release: false });
    expect(screen.getByTestId("selection-box")).toBeInTheDocument();
    releaseOnPlan([-200, -300]);
    expect(screen.queryByTestId("selection-box")).not.toBeInTheDocument();
    // Only half the desk was inside, and none of the wall.
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();

    dragOnPlan([-200, -300], [8200, 1500], { shiftKey: true });
    expect(
      screen.getByText(
        "2 elements of different kinds selected. Select one kind to change them together.",
      ),
    ).toBeVisible();
    expect(changesets).toHaveLength(0);
  });

  it("Keyboard and mouse lists it, and the Select hint mentions it (docs/0130)", async () => {
    await renderApp("/floors/f3/edit", stubEditorRoutes());
    await screen.findByText("Draft 3 · Saved");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Shift+drag to add everything in a rectangle.",
    );
    await userEvent.keyboard("?");
    const sheet = await screen.findByRole("dialog", { name: "Keyboard and mouse" });
    expect(within(sheet).getByText("Shift+drag")).toBeVisible();
    expect(within(sheet).getByText("Select everything inside a rectangle")).toBeVisible();
  });
});
