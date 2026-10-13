// @vitest-environment jsdom
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import i18n from "@/i18n";
import { applyTheme, useTheme } from "@/lib/theme";
import { routeTree } from "@/routes";

import { useSidebar } from "./sidebarState";

beforeAll(() => {
  // jsdom has no matchMedia; the theme code asks it for the system setting.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

afterEach(async () => {
  cleanup(); // Testing Library only auto-cleans with Vitest globals, which we don't use
  await act(() => i18n.changeLanguage("en"));
  useSidebar.setState({ collapsed: false });
  useTheme.setState({ choice: "system" });
});

async function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
  await act(() => router.load());
  return router;
}

describe("app shell (docs/0087)", () => {
  it("opens on Floors, with the main areas in the sidebar", async () => {
    const router = await renderAt("/");
    expect(router.state.location.pathname).toBe("/floors");
    expect(screen.getByRole("heading", { name: "Floors" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav).toHaveTextContent("Floors");
    expect(nav).toHaveTextContent("Seats");
    expect(screen.getByRole("link", { name: "Floors" })).toHaveAttribute("aria-current", "page");
  });

  it("switches to Hebrew, right to left", async () => {
    await renderAt("/floors");
    await act(() => i18n.changeLanguage("he"));
    expect(screen.getByRole("heading", { name: "קומות" })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(document.documentElement).toHaveAttribute("lang", "he");
    await act(() => i18n.changeLanguage("en"));
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
  });

  it("collapses the sidebar to icons and keeps names for screen readers", async () => {
    await renderAt("/seats");
    await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Seats" })).toBeInTheDocument();
  });

  it("dark mode puts the dark class on the page", () => {
    applyTheme("dark");
    expect(document.documentElement).toHaveClass("dark");
    applyTheme("light");
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("unknown addresses say so", async () => {
    await renderAt("/nowhere");
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });
});
