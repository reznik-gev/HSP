// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { ADMIN, renderApp, type Reply, type Routes } from "@/test/renderApp";

const unit = (id: string, name: string, parent_id: string | null) => ({
  id,
  name,
  parent_id,
  level_label: null,
  color: null,
  external_id: null,
  archived_at: null,
  source: "manual",
});
const UNITS = [unit("u0", "Acme", null), unit("u1", "Platform", "u0"), unit("u2", "Vision", "u0")];
const MAYA = {
  id: "p1",
  display_name: "Maya Shani",
  email: "maya@acme.example",
  title: "Backend Engineer",
  external_id: "E102",
  active: true,
  source: "manual",
  primary_unit_id: "u1",
  memberships: [{ unit_id: "u1", position_id: null, is_primary: true, primary_override: false }],
};
const ref = (id: string, name: string) => ({ id, name });
const SEAT = {
  id: "d2",
  label: "HT-3-02",
  allocation_mode: "assigned",
  site: ref("s1", "Tel Aviv HQ"),
  building: ref("b1", "Harbor Tower"),
  floor: ref("f3", "Floor 3"),
  holder_person: null,
  holder_unit: null,
};

function backend(extra: Routes = {}): Routes {
  return {
    "GET /api/v1/org-units": { status: 200, body: { items: UNITS, next_cursor: null } },
    "GET /api/v1/people": { status: 200, body: { items: [MAYA], next_cursor: null } },
    "GET /api/v1/people/p1": { status: 200, body: MAYA },
    "GET /api/v1/seats": { status: 200, body: { items: [SEAT], next_cursor: null } },
    "GET /api/v1/devices": {
      status: 200,
      body: {
        items: [
          {
            id: "dev1",
            asset_tag: "MON-0412",
            serial_number: null,
            notes: null,
            assigned_person_id: "p1",
            placement: { floor_id: "f3", floor_name: "Floor 3", element_id: "e", version: 2 },
          },
        ],
        next_cursor: null,
      },
    },
    "GET /api/v1/org-units/u1/positions": { status: 200, body: { items: [], next_cursor: null } },
    ...extra,
  };
}

const asViewer = { "GET /api/v1/auth/me": { status: 200, body: { ...ADMIN, is_admin: false } } };

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await act(() => i18n.changeLanguage("en"));
});

describe("people (docs/0088)", () => {
  it("lists people with their primary team, and filters those without a seat", async () => {
    const { calls, router } = await renderApp("/people", backend());
    const row = await screen.findByRole("row", { name: /Maya Shani/ });
    expect(row).toHaveTextContent("Platform");
    expect(row).toHaveTextContent("Backend Engineer");
    await userEvent.click(screen.getByRole("checkbox", { name: "Without a seat" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ unseated: true }));
    await waitFor(() =>
      expect(calls.some((r) => new URL(r.url).searchParams.get("seated") === "false")).toBe(true),
    );
  });

  it("a viewer sees a person's teams, seats and devices but can't change anything", async () => {
    await renderApp("/people?person=p1", { ...backend(), ...asViewer });
    const panel = await screen.findByRole("dialog", { name: "Maya Shani" });
    expect(await within(panel).findByText("HT-3-02")).toBeInTheDocument();
    expect(within(panel).getByText("MON-0412")).toBeInTheDocument();
    expect(await within(panel).findByText("Platform")).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Deactivate" })).toBeNull();
    expect(within(panel).queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "New person" })).toBeNull();
  });

  it("an admin creates a person; a taken email is shown on its field", async () => {
    let attempts = 0;
    const { router } = await renderApp(
      "/people",
      backend({
        "POST /api/v1/people": (): Reply =>
          ++attempts === 1
            ? { status: 409, body: { type: "/problems/email-taken", title: "Email already used" } }
            : { status: 201, body: { ...MAYA, id: "p9", display_name: "Dana Cohen" } },
        "GET /api/v1/people/p9": { status: 200, body: { ...MAYA, id: "p9" } },
      }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "New person" }));
    const panel = await screen.findByRole("dialog", { name: "New person" });
    await userEvent.type(within(panel).getByLabelText("Name"), "Dana Cohen");
    await userEvent.type(within(panel).getByLabelText("Email"), "dana@acme.example");
    await userEvent.click(within(panel).getByRole("button", { name: "Create person" }));
    expect(await within(panel).findByText("This email is already in use.")).toBeVisible();
    expect(within(panel).getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    await userEvent.click(within(panel).getByRole("button", { name: "Create person" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ person: "p9" }));
    expect(await screen.findByText("Dana Cohen created")).toBeInTheDocument();
  });

  it("deactivating says which seats were freed; Undo gives back only seats still free", async () => {
    const seatState: Record<string, unknown> = { d2: null, d7: { holder_person_id: "p5" } };
    const { calls } = await renderApp(
      "/people?person=p1",
      backend({
        "DELETE /api/v1/people/p1": {
          status: 200,
          body: {
            person: { ...MAYA, active: false },
            freed_seats: [
              { seat_id: "d2", holder_person_id: "p1", holder_unit_id: null },
              { seat_id: "d7", holder_person_id: "p1", holder_unit_id: null },
            ],
          },
        },
        "POST /api/v1/people/p1/reactivate": { status: 200, body: MAYA },
        "GET /api/v1/seats/d2/assignment": {
          status: 200,
          body: { seat_id: "d2", label: "A", floor_id: "f3", assignment: seatState.d2 },
        },
        "GET /api/v1/seats/d7/assignment": {
          status: 200,
          body: { seat_id: "d7", label: "B", floor_id: "f3", assignment: seatState.d7 },
        },
        "PUT /api/v1/seats/d2/assignment": { status: 200, body: {} },
      }),
    );
    const panel = await screen.findByRole("dialog", { name: "Maya Shani" });
    await userEvent.click(within(panel).getByRole("button", { name: "Deactivate" }));
    expect(await screen.findByText("Maya Shani deactivated")).toBeInTheDocument();
    expect(screen.getByText("2 seats freed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(
      await screen.findByText("1 seat was assigned in the meantime and stays as it is."),
    ).toBeInTheDocument();
    const puts = calls.filter((r) => r.method === "PUT").map((r) => new URL(r.url).pathname);
    expect(puts).toEqual(["/api/v1/seats/d2/assignment"]); // d7 stays with its new holder
  });

  it("in several teams, the primary one must be chosen", async () => {
    const { calls } = await renderApp(
      "/people?person=p1",
      backend({
        "PUT /api/v1/people/p1/memberships": {
          status: 422,
          body: {
            type: "/problems/request-invalid",
            title: "Invalid memberships",
            errors: [{ code: "primary_required", message: "Mark which unit is primary." }],
          },
        },
      }),
    );
    const panel = await screen.findByRole("dialog", { name: "Maya Shani" });
    await userEvent.click(await within(panel).findByRole("button", { name: "Add team" }));
    await userEvent.click(within(panel).getByRole("button", { name: "Save teams" }));
    expect(await within(panel).findByRole("alert")).toHaveTextContent(
      "Choose which team is primary.",
    );
    const put = calls.find((r) => r.method === "PUT");
    expect(put?.headers.get("X-CSRF-Token")).toBe(ADMIN.csrf_token);
  });
});
