// @vitest-environment jsdom
import { act, cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { page } from "@/test/stubs";
import { AS_VIEWER, renderApp } from "@/test/renderApp";

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

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await act(() => i18n.changeLanguage("en"));
});

const withSite = {
  "GET /api/v1/sites": { status: 200, body: page([SITE]) },
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
        .slice(0, 7) // the admin's actions cell follows
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
      "GET /api/v1/sites": { status: 200, body: page([]) },
    });
    expect(await screen.findByText(/No sites yet/)).toBeInTheDocument();
  });

  it("says so when the floors can't be loaded", async () => {
    await renderApp("/floors", { "GET /api/v1/sites": { status: 500 } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the floors");
  });

  it("admins add, edit and archive locations; Undo restores and gives seats back", async () => {
    let posted: unknown = null;
    const { calls } = await renderApp("/floors", {
      ...withSite,
      "POST /api/v1/sites": (r: Request) => {
        posted = r;
        return { status: 201, body: { ...SITE, id: "s2", name: "Haifa" } };
      },
      "DELETE /api/v1/floors/f3": {
        status: 200,
        body: {
          archived: [{ kind: "floor", id: "f3", name: "Floor 3" }],
          freed_seats: [{ seat_id: "d1", holder_person_id: "p1", holder_unit_id: null }],
          moved_members: [],
        },
      },
      "POST /api/v1/floors/f3/restore": { status: 200, body: {} },
      "GET /api/v1/seats/d1/assignment": { status: 200, body: { assignment: null } },
      "PUT /api/v1/seats/d1/assignment": { status: 200, body: {} },
    });
    await userEvent.click(await screen.findByRole("button", { name: "Add site" }));
    const sheet = await screen.findByRole("dialog", { name: "Add site" });
    await userEvent.type(within(sheet).getByLabelText("Name"), "Haifa");
    await userEvent.click(within(sheet).getByRole("button", { name: "Create" }));
    expect(await screen.findByText("Haifa created")).toBeInTheDocument();
    expect(posted).not.toBeNull();

    await userEvent.click(await screen.findByRole("button", { name: "Actions for Floor 3" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Archive" }));
    expect(await screen.findByText("Floor 3 archived")).toBeInTheDocument();
    expect(screen.getByText("1 seat freed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("Floor 3 restored")).toBeInTheDocument();
    const after = calls.map((r) => `${r.method} ${new URL(r.url).pathname}`);
    expect(after).toContain("POST /api/v1/floors/f3/restore");
    expect(after).toContain("PUT /api/v1/seats/d1/assignment");
  });

  it("viewers get no location actions", async () => {
    await renderApp("/floors", {
      ...withSite,
      ...AS_VIEWER,
    });
    await screen.findByRole("row", { name: /Floor 3/ });
    expect(screen.queryByRole("button", { name: "Add site" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Actions for/ })).toBeNull();
  });
});
