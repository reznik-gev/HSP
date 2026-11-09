// @vitest-environment jsdom
/** Selecting with a rectangle, and dragging what was selected together (docs/0133). */
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import i18n from "@/i18n";
import { spyChangesets, stubEditorRoutes } from "@/test/editorStubs";
import { dragOnPlan, releaseOnPlan } from "@/test/planPointer";
import { renderApp } from "@/test/renderApp";

afterEach(async () => {
  cleanup();
  await act(() => i18n.changeLanguage("en"));
});

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
    await act(() => i18n.changeLanguage("he"));
    expect(within(sheet).getByText("Shift+גרירה")).toBeVisible();
    expect(within(sheet).getByText("בחירת כל מה שבתוך מלבן")).toBeVisible();
  });

  it("dragging one of the selection moves it all, saved as one change", async () => {
    const { routes, changesets } = spyChangesets();
    await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    dragOnPlan([-200, -300], [8200, 1500], { shiftKey: true }); // the wall and the desk

    dragOnPlan([2000, 1000], [2000, 2000], { release: false }); // by the desk
    expect(screen.getByTestId("group-wall")).toBeInTheDocument();
    releaseOnPlan([2000, 2000]);
    expect(screen.queryByTestId("group-wall")).not.toBeInTheDocument();

    await waitFor(() => expect(changesets).toHaveLength(1), { timeout: 3000 });
    expect(changesets[0]!.ops).toEqual(
      expect.arrayContaining([
        { op: "update", kind: "object", id: "d1", data: { position: [2000, 2000, 0] } },
        { op: "update", kind: "wall", id: "w1", data: { a: [0, 1000], b: [8000, 1000] } },
      ]),
    );
  });
});
