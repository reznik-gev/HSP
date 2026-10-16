// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/api/client";
import { useSessionExpired } from "@/auth/expiry";
import { initials, navigation } from "@/auth/session";
import { ADMIN, renderApp } from "@/test/renderApp";

let assigned: string[] = [];

beforeEach(() => {
  assigned = [];
  vi.spyOn(navigation, "assign").mockImplementation((url) => void assigned.push(url));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useSessionExpired.setState({ expired: false });
});

/** Signing out of HSP sends the browser on to Keycloak's logout. */
const SIGNED_OUT = { logout_url: "/auth/realms/hsp/logout" };

describe("session (docs/0038, docs/0087)", () => {
  it("sends a signed-out visitor to sign in, coming back to the same page", async () => {
    window.history.replaceState(null, "", "/seats?q=maya");
    await renderApp("/seats", { "GET /api/v1/auth/me": { status: 401 } });
    await waitFor(() => expect(assigned).toEqual(["/api/v1/auth/login?next=%2Fseats%3Fq%3Dmaya"]));
    expect(screen.getByRole("status")).toHaveTextContent("Taking you to sign in");
  });

  it("shows who is signed in, and signs out of HSP and Keycloak", async () => {
    const { calls } = await renderApp("/floors", {
      "POST /api/v1/auth/logout": { status: 200, body: SIGNED_OUT },
    });
    await userEvent.click(await screen.findByRole("button", { name: "Account: Noa Barak" }));
    expect(screen.getByText("noa@acme.example")).toBeInTheDocument();
    expect(screen.getByText("Administrator")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(assigned).toEqual(["/auth/realms/hsp/logout"]));
    const logout = calls.find((r) => r.method === "POST");
    expect(logout?.headers.get("X-CSRF-Token")).toBe(ADMIN.csrf_token);
  });

  it("explains when the server can't be reached", async () => {
    await renderApp("/floors", { "GET /api/v1/auth/me": { status: 502 } });
    // /auth/me retries once (about a second) before giving up.
    const alert = await screen.findByRole("alert", {}, { timeout: 4000 });
    expect(alert).toHaveTextContent("Can't reach the HSP server");
  });

  it("a session that ends mid-use asks to sign in again instead of failing silently", async () => {
    await renderApp("/floors", { "GET /api/v1/sites": { status: 401 } });
    await screen.findByRole("navigation", { name: "Main" });
    await act(() => api.GET("/api/v1/sites"));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("You've been signed out");
    await userEvent.click(screen.getByRole("button", { name: "Sign in again" }));
    expect(assigned[0]).toMatch(/^\/api\/v1\/auth\/login\?next=/);
  });

  it("initials come from the name, else the email", () => {
    expect(initials(ADMIN)).toBe("NB");
    expect(initials({ ...ADMIN, name: null })).toBe("N");
  });
});
