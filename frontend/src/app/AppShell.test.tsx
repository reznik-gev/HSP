// @vitest-environment jsdom
import { act, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { applyTheme, useTheme } from "@/lib/theme";
import { renderApp as render } from "@/test/renderApp";

import { useSidebar } from "./sidebarState";

beforeAll(() => {
  // jsdom has no matchMedia; the theme code asks it for the system setting.
});

afterEach(async () => {
  cleanup(); // Testing Library only auto-cleans with Vitest globals, which we don't use
  vi.unstubAllGlobals();
  await act(() => i18n.changeLanguage("en"));
  useSidebar.setState({ collapsed: false });
  useTheme.setState({ choice: "system" });
});

async function renderAt(path: string) {
  const { router } = await render(path);
  await screen.findByRole("navigation", { name: "Main" }); // signed in: the shell is up
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
    await render("/nowhere"); // not-found pages need no session
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });
});
