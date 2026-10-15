// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { useTheme } from "@/lib/theme";
import { renderApp } from "@/test/renderApp";

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await act(() => i18n.changeLanguage("en"));
  useTheme.setState({ choice: "system" });
});

describe("saved preferences (docs/0046, docs/0087)", () => {
  it("applies the user's saved language and theme after sign-in", async () => {
    await renderApp("/floors", {
      "GET /api/v1/me/preferences": {
        status: 200,
        body: { language: "he", theme: "dark", display_units: null },
      },
    });
    expect(await screen.findByRole("heading", { name: "קומות" })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(useTheme.getState().choice).toBe("dark");
  });

  it("saves a new choice to the server, keeping the others", async () => {
    const { calls } = await renderApp("/floors", {
      "GET /api/v1/me/preferences": {
        status: 200,
        body: { language: "en", theme: null, display_units: "m" },
      },
    });
    await userEvent.click(await screen.findByRole("button", { name: "Appearance" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Dark" }));
    await waitFor(() => expect(calls.some((r) => r.method === "PUT")).toBe(true));
    const put = calls.find((r) => r.method === "PUT");
    expect(put?.headers.get("X-CSRF-Token")).toBe("csrf-123");
    expect(await put?.json()).toEqual({
      language: "en",
      theme: "dark",
      display_units: "m",
      grid_mm: null,
    });
  });
});
