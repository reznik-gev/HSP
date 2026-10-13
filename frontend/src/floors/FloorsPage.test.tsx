// @vitest-environment jsdom
import { act, cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { renderApp } from "@/test/renderApp";

const SITE = { id: "s1", name: "Tel Aviv HQ", time_zone: "Asia/Jerusalem", address: null };
const counts = (total: number, people: number, units: number, free: number, bookable: number) => ({
  total,
  assigned_to_people: people,
  reserved_for_units: units,
  free,
  bookable,
  unavailable: total - people - units - free - bookable,
});
const OCCUPANCY = {
  id: "s1",
  name: "Tel Aviv HQ",
  counts: counts(9, 4, 1, 1, 2),
  buildings: [
    {
      id: "b1",
      name: "Harbor Tower",
      code: "HT",
      counts: counts(9, 4, 1, 1, 2),
      floors: [
        { id: "f3", name: "Floor 3", level_index: 3, counts: counts(9, 4, 1, 1, 2) },
        { id: "f4", name: "Floor 4", level_index: 4, counts: counts(0, 0, 0, 0, 0) },
      ],
    },
    { id: "b2", name: "Annex", code: "AX", counts: counts(0, 0, 0, 0, 0), floors: [] },
  ],
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

const withSite = {
  "GET /api/v1/sites": { status: 200, body: { items: [SITE], next_cursor: null } },
  "GET /api/v1/occupancy/sites/s1": { status: 200, body: OCCUPANCY },
};

describe("floors page (docs/0085, docs/0087)", () => {
  it("lists each site's buildings and floors with seat counts", async () => {
    await renderApp("/floors", withSite);
    expect(await screen.findByRole("heading", { name: "Tel Aviv HQ" })).toBeInTheDocument();
    const row = await screen.findByRole("row", { name: /Floor 3/ });
    // level, seats, taken (people + units), free, bookable, unavailable
    expect(
      within(row)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["3", "9", "5", "1", "2", "1", "83%"]);
    expect(within(row).getByRole("img")).toHaveAccessibleName("5 of 6 assignable seats taken");
    // A floor with no assignable seats shows a dash rather than 0%.
    expect(screen.getByRole("row", { name: /Floor 4/ })).toHaveTextContent("–");
    expect(screen.getByText("No floors in this building yet.")).toBeInTheDocument();
  });

  it("reads in Hebrew, numbers included", async () => {
    await renderApp("/floors", withSite);
    await screen.findByRole("row", { name: /Floor 3/ });
    await act(() => i18n.changeLanguage("he"));
    expect(screen.getByRole("columnheader", { name: "תפוסות" })).toBeInTheDocument();
    expect(screen.getByText("קוד HT")).toBeInTheDocument();
  });

  it("says what to do when there are no sites yet", async () => {
    await renderApp("/floors", {
      "GET /api/v1/sites": { status: 200, body: { items: [], next_cursor: null } },
    });
    expect(await screen.findByText(/No sites yet/)).toBeInTheDocument();
  });

  it("says so when the floors can't be loaded", async () => {
    await renderApp("/floors", { "GET /api/v1/sites": { status: 500 } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the floors");
  });
});
