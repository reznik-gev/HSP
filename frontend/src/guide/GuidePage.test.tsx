// @vitest-environment jsdom
/** The user guide (docs/0144): opened from the user menu; viewers see only the part for everyone. */
import { act, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { AS_VIEWER, renderApp } from "@/test/renderApp";
import { stubLocationRoutes } from "@/test/stubs";

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await act(() => i18n.changeLanguage("en"));
});

describe("the user guide", () => {
  it("opens from the user menu", async () => {
    const { router } = await renderApp("/floors", stubLocationRoutes());
    await userEvent.click(await screen.findByRole("button", { name: /Account/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "User guide" }));
    expect(router.state.location.pathname).toBe("/guide");
    expect(await screen.findByRole("heading", { level: 1, name: "User guide" })).toBeVisible();
  });

  it("shows admins both parts, with contents and links to the screens", async () => {
    await renderApp("/guide");
    expect(await screen.findByRole("heading", { level: 2, name: "Using HSP" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "For admins" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Find where someone sits" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "3. Publish" })).toBeVisible();

    const contents = screen.getByRole("navigation", { name: "Contents" });
    expect(contents).toContainElement(screen.getByRole("link", { name: "3. Publish" }));
    expect(screen.getByRole("link", { name: "3. Publish" })).toHaveAttribute(
      "href",
      "#admins-3-publish",
    );
    expect(screen.getAllByRole("link", { name: "Free seats" })[0]).toHaveAttribute(
      "href",
      "/seats/free",
    );
    expect(screen.getAllByRole("img", { name: "Finding where someone sits" })).toHaveLength(1);
    expect(screen.getAllByText("Enter", { selector: "kbd" }).length).toBeGreaterThan(0);
  });

  it("shows viewers only the part for everyone", async () => {
    await renderApp("/guide", AS_VIEWER);
    expect(await screen.findByRole("heading", { level: 2, name: "Using HSP" })).toBeVisible();
    expect(screen.queryByRole("heading", { level: 2, name: "For admins" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "3. Publish" })).toBeNull();
  });

  it("is in Hebrew too", async () => {
    await renderApp("/guide");
    await act(() => i18n.changeLanguage("he"));
    expect(await screen.findByRole("heading", { level: 1, name: "מדריך למשתמש" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "איפה מישהו יושב" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "למנהלים" })).toBeVisible();
  });
});
