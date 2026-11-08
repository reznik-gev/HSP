// @vitest-environment jsdom
/** Learning the editor: the hint line and the Keyboard and mouse sheet (docs/0129). */
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { spyChangesets, stubEditorRoutes } from "@/test/editorStubs";
import { clickOnPlan } from "@/test/planPointer";
import { renderApp } from "@/test/renderApp";

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await act(() => i18n.changeLanguage("en"));
});

const hint = () => screen.getByTestId("hint-line");

describe("learning the editor (docs/0129)", () => {
  it("the hint line follows the tool and the selection", async () => {
    await renderApp("/floors/f3/edit", spyChangesets().routes);
    await screen.findByText("Draft 3 · Saved");
    expect(hint()).toHaveTextContent("Click to select, Shift+click to add.");
    clickOnPlan([2000, 1000]); // the desk
    await waitFor(() => expect(hint()).toHaveTextContent("R turns furniture."));
    await userEvent.keyboard("w");
    expect(hint()).toHaveTextContent("Click to start a wall. Shift: 45° steps.");
  });

  it("? opens Keyboard and mouse, which lists every move; keys don't reach the plan under it", async () => {
    await renderApp("/floors/f3/edit", stubEditorRoutes());
    await screen.findByText("Draft 3 · Saved");
    await userEvent.keyboard("?");
    const sheet = await screen.findByRole("dialog", { name: "Keyboard and mouse" });
    expect(within(sheet).getByText("Ctrl+Shift+V")).toBeVisible();
    expect(within(sheet).getByText("Alt while dragging a wall")).toBeVisible();
    expect(within(sheet).getByRole("heading", { name: "Tools" })).toBeVisible();
    await userEvent.keyboard("w");
    // The sheet hides the editor from the accessibility tree while it's open.
    expect(screen.getByRole("button", { name: "Select", hidden: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("the hint line's All keys and the top bar's button open it too", async () => {
    await renderApp("/floors/f3/edit", stubEditorRoutes());
    await screen.findByText("Draft 3 · Saved");
    await userEvent.click(within(hint()).getByRole("button", { name: "All keys (?)" }));
    expect(await screen.findByRole("dialog", { name: "Keyboard and mouse" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Keyboard and mouse" }));
    expect(await screen.findByRole("dialog", { name: "Keyboard and mouse" })).toBeVisible();
  });

  it("in Hebrew, the hint and the sheet are in Hebrew", async () => {
    await act(() => i18n.changeLanguage("he"));
    await renderApp("/floors/f3/edit", stubEditorRoutes());
    await screen.findByRole("toolbar");
    await waitFor(() => expect(hint()).toHaveTextContent("לחצו כדי לבחור"));
    await userEvent.keyboard("?");
    expect(await screen.findByRole("dialog", { name: "מקלדת ועכבר" })).toBeVisible();
  });
});
