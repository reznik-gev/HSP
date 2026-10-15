// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { page } from "@/test/stubs";
import { stubBackend, renderApp, type Reply, type Routes } from "@/test/renderApp";

import { undoUnitArchive } from "./undo";

const unit = (id: string, name: string, parent_id: string | null, level: string | null = null) => ({
  id,
  name,
  parent_id,
  level_label: level,
  color: null,
  external_id: null,
  archived_at: null,
  source: "manual",
});
const UNITS = [
  unit("u0", "Acme", null, "Company"),
  unit("rnd", "R&D", "u0", "Division"),
  unit("plat", "Platform", "rnd", "Team"),
  unit("ops", "Operations", "u0", "Division"),
];
const membership = (unit_id: string, is_primary = true) => ({
  unit_id,
  position_id: null,
  is_primary,
  primary_override: is_primary,
});
const person = (id: string, name: string, memberships: object[]) => ({
  id,
  display_name: name,
  email: `${id}@acme.example`,
  title: null,
  external_id: null,
  active: true,
  source: "manual",
  primary_unit_id: null,
  memberships,
});
const PEOPLE = [
  person("p1", "Maya", [membership("plat")]),
  person("p2", "Omer", [membership("plat"), membership("rnd", false)]),
  person("p3", "Avi", [membership("ops")]),
];

function backend(extra: Routes = {}): Routes {
  return {
    "GET /api/v1/org-units": { status: 200, body: page(UNITS) },
    "GET /api/v1/people": (r: Request): Reply => {
      const unitId = new URL(r.url).searchParams.get("unit_id");
      const items = unitId
        ? PEOPLE.filter((p) =>
            p.memberships.some((m) => (m as { unit_id: string }).unit_id === unitId),
          )
        : PEOPLE;
      return { status: 200, body: { items, next_cursor: null } };
    },
    "GET /api/v1/org-units/plat/positions": {
      status: 200,
      body: page([{ id: "pos1", unit_id: "plat", title: "Team Lead" }]),
    },
    ...extra,
  };
}

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await act(() => i18n.changeLanguage("en"));
});

describe("teams (docs/0088)", () => {
  it("shows the tree with direct member counts; teams expand and collapse", async () => {
    await renderApp("/org", backend());
    const tree = await screen.findByRole("tree", { name: "Teams" });
    const rnd = within(tree).getByRole("treeitem", { name: /R&D/ });
    expect(rnd).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(rnd).toHaveTextContent("1 person")); // Omer, as a secondary team
    expect(within(tree).queryByRole("treeitem", { name: /Platform/ })).toBeNull();
    await userEvent.click(within(rnd).getByRole("button", { name: "Expand R&D" }));
    expect(await within(tree).findByRole("treeitem", { name: /Platform/ })).toHaveTextContent(
      "2 people",
    );
  });

  it("the chart view draws every team as a link to its panel", async () => {
    const { router } = await renderApp("/org", backend());
    await userEvent.click(await screen.findByRole("button", { name: "Chart" }));
    expect(router.state.location.search).toMatchObject({ view: "chart" });
    const chart = await screen.findByRole("group", { name: "Org chart" });
    const platform = await within(chart).findByRole("link", { name: "Platform, 2 people" });
    expect(platform).toHaveAttribute("href", "/org?view=chart&unit=plat");
    expect(within(chart).getAllByRole("link")).toHaveLength(4);
  });

  it("a team opens with its positions and members", async () => {
    await renderApp("/org?unit=plat", backend());
    const panel = await screen.findByRole("dialog", { name: "Platform" });
    expect(await within(panel).findByText("Team Lead")).toBeInTheDocument();
    expect(await within(panel).findByRole("link", { name: "Maya" })).toHaveAttribute(
      "href",
      "/people?person=p1",
    );
  });

  it("moving a team under its own sub-team is refused on the field", async () => {
    await renderApp(
      "/org?unit=rnd",
      backend({
        "PATCH /api/v1/org-units/rnd": {
          status: 409,
          body: { type: "/problems/unit-cycle", title: "Cycle" },
        },
      }),
    );
    const panel = await screen.findByRole("dialog", { name: "R&D" });
    const parent = within(panel).getByLabelText("Part of");
    // Its own sub-team isn't even offered; force the request to see the server's answer.
    expect(within(parent).queryByRole("option", { name: /Platform/ })).toBeNull();
    await userEvent.click(within(panel).getByRole("button", { name: "Save" }));
    expect(
      await within(panel).findByText("A team can't be part of its own sub-team."),
    ).toBeVisible();
  });

  it("archiving says what moved and offers Undo", async () => {
    await renderApp(
      "/org?unit=rnd",
      backend({
        "DELETE /api/v1/org-units/rnd": {
          status: 200,
          body: {
            archived: [
              { kind: "org_unit", id: "rnd", name: "R&D" },
              { kind: "org_unit", id: "plat", name: "Platform" },
            ],
            moved_members: [
              {
                person_id: "p1",
                from_unit_ids: ["plat"],
                to_unit_id: "u0",
                previous: [{ unit_id: "plat", position_id: null, is_primary: true }],
                merged: false,
              },
            ],
            freed_seats: [],
          },
        },
      }),
    );
    const panel = await screen.findByRole("dialog", { name: "R&D" });
    await userEvent.click(within(panel).getByRole("button", { name: "Archive team" }));
    expect(await screen.findByText("R&D archived")).toBeInTheDocument();
    expect(
      screen.getByText("1 sub-team too · 1 person moved to the parent team"),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "R&D" })).toBeNull());
  });
});

describe("undoing a team archive (docs/0088)", () => {
  it("restores teams top-down, puts members back exactly, and never takes a seat back", async () => {
    const { calls } = stubBackend({
      "POST /api/v1/org-units/rnd/restore": { status: 200, body: {} },
      "POST /api/v1/org-units/plat/restore": { status: 200, body: {} },
      // Maya was moved into the root by the archive; Omer was already in the root.
      "GET /api/v1/people/p1": { status: 200, body: person("p1", "Maya", [membership("u0")]) },
      "GET /api/v1/people/p2": {
        status: 200,
        body: person("p2", "Omer", [membership("u0"), membership("ops", false)]),
      },
      "PUT /api/v1/people/p1/memberships": { status: 200, body: {} },
      "PUT /api/v1/people/p2/memberships": { status: 200, body: {} },
      "GET /api/v1/seats/s1/assignment": { status: 200, body: { assignment: null } },
      "GET /api/v1/seats/s2/assignment": { status: 200, body: { assignment: { x: 1 } } },
      "PUT /api/v1/seats/s1/assignment": { status: 200, body: {} },
    });
    const result = await undoUnitArchive({
      archived: [
        { kind: "org_unit", id: "rnd", name: "R&D" },
        { kind: "org_unit", id: "plat", name: "Platform" },
      ],
      moved_members: [
        {
          person_id: "p1",
          from_unit_ids: ["plat"],
          to_unit_id: "u0",
          previous: [{ unit_id: "plat", position_id: "pos1", is_primary: true }],
          merged: false,
        },
        {
          person_id: "p2",
          from_unit_ids: ["rnd"],
          to_unit_id: "u0",
          previous: [{ unit_id: "rnd", position_id: null, is_primary: false }],
          merged: true,
        },
      ],
      freed_seats: [
        { seat_id: "s1", holder_person_id: null, holder_unit_id: "plat" },
        { seat_id: "s2", holder_person_id: null, holder_unit_id: "plat" },
      ],
    });
    const paths = calls.map((r) => `${r.method} ${new URL(r.url).pathname}`);
    expect(paths.slice(0, 2)).toEqual([
      "POST /api/v1/org-units/rnd/restore",
      "POST /api/v1/org-units/plat/restore",
    ]);
    const bodies = await Promise.all(
      calls
        .filter((r) => r.method === "PUT")
        .map(async (r): Promise<[string, unknown]> => [new URL(r.url).pathname, await r.json()]),
    );
    expect(bodies).toEqual([
      // Maya: the root membership was created by the move, so it goes; Platform comes back as
      // her lone (hence implicitly primary) team, with her position.
      [
        "/api/v1/people/p1/memberships",
        [{ unit_id: "plat", position_id: "pos1", is_primary: false }],
      ],
      // Omer: already in the root before, so he keeps it, and keeps his primary.
      [
        "/api/v1/people/p2/memberships",
        [
          { unit_id: "u0", position_id: null, is_primary: true },
          { unit_id: "ops", position_id: null, is_primary: false },
          { unit_id: "rnd", position_id: null, is_primary: false },
        ],
      ],
      ["/api/v1/seats/s1/assignment", { unit_id: "plat" }],
    ]);
    expect(result.skippedSeats).toBe(1); // s2 went to someone else meanwhile
  });
});
