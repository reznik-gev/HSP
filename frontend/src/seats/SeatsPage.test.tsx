// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { renderApp, type Reply } from "@/test/renderApp";

const ref = (id: string, name: string) => ({ id, name });
const MAYA_SEAT = {
  id: "d2",
  label: "HT-3-02",
  allocation_mode: "assigned",
  site: ref("s1", "Tel Aviv HQ"),
  building: ref("b1", "Harbor Tower"),
  floor: ref("f3", "Floor 3"),
  holder_person: {
    id: "p1",
    display_name: "Maya Shani",
    email: "maya@acme.example",
    primary_unit: ref("u1", "Platform"),
  },
  holder_unit: null,
};

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await act(() => i18n.changeLanguage("en"));
});

function seats(items: object[], next_cursor: string | null = null) {
  return (request: Request): Reply => ({
    status: 200,
    body: { items, next_cursor, q: new URL(request.url).searchParams.get("q") },
  });
}

describe("where does X sit? (docs/0085, docs/0087)", () => {
  it("searching from the top bar lists the seat, its holder, team and place", async () => {
    const { router, calls } = await renderApp("/floors", {
      "GET /api/v1/sites": { status: 200, body: { items: [], next_cursor: null } },
      "GET /api/v1/seats": seats([MAYA_SEAT]),
    });
    const box = await screen.findByRole("searchbox", { name: "Search seats, people and teams" });
    await userEvent.type(box, "maya{Enter}");
    await waitFor(() => expect(router.state.location.pathname).toBe("/seats"));
    expect(router.state.location.search).toEqual({ q: "maya" });

    const row = await screen.findByRole("row", { name: /HT-3-02/ });
    expect(row).toHaveTextContent("Maya Shani");
    expect(row).toHaveTextContent("Platform");
    expect(row).toHaveTextContent("Tel Aviv HQ›Harbor Tower›Floor 3");
    const show = within(row).getByRole("link", { name: "Show HT-3-02 on the floor plan" });
    expect(show).toHaveAttribute("href", "/floors/f3?seat=d2");
    const searched = calls.find((r) => new URL(r.url).pathname === "/api/v1/seats");
    expect(new URL(searched!.url).searchParams.get("q")).toBe("maya");
  });

  it("says when nothing matches, and how to search differently", async () => {
    await renderApp("/seats?q=nobody", { "GET /api/v1/seats": seats([]) });
    expect(await screen.findByText(/No seats match “nobody”/)).toBeInTheDocument();
  });

  it("loads more results on request", async () => {
    let calls = 0;
    await renderApp("/seats?q=ht", {
      "GET /api/v1/seats": (request) => {
        calls += 1;
        const second = new URL(request.url).searchParams.get("cursor") === "next";
        return seats(
          [{ ...MAYA_SEAT, id: second ? "d3" : "d2", label: second ? "HT-3-03" : "HT-3-02" }],
          second ? null : "next",
        )(request);
      },
    });
    await userEvent.click(await screen.findByRole("button", { name: "Show more" }));
    expect(await screen.findByRole("row", { name: /HT-3-03/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /HT-3-02/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
    expect(calls).toBe(2);
  });

  it("reads in Hebrew", async () => {
    await renderApp("/seats?q=maya", { "GET /api/v1/seats": seats([MAYA_SEAT]) });
    await screen.findByRole("row", { name: /HT-3-02/ });
    await act(() => i18n.changeLanguage("he"));
    expect(screen.getByRole("columnheader", { name: "צוות" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "הצגת HT-3-02 בתוכנית הקומה" })).toBeInTheDocument();
  });
});
