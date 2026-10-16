// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import {
  page,
  STUB_MAYA,
  STUB_MAYAS_MONITOR,
  stubDeviceRoutes,
  stubPerson,
  stubSeat,
  STUB_UNITS,
} from "@/test/stubs";
import { AS_VIEWER, ADMIN, renderApp, type Reply, type Routes } from "@/test/renderApp";

const SEAT = stubSeat("d2", "HT-3-02");

function backend(extra: Routes = {}): Routes {
  return {
    "GET /api/v1/org-units": { status: 200, body: page(STUB_UNITS) },
    "GET /api/v1/people": { status: 200, body: page([STUB_MAYA]) },
    "GET /api/v1/people/p1": { status: 200, body: STUB_MAYA },
    "GET /api/v1/seats": { status: 200, body: page([SEAT]) },
    ...stubDeviceRoutes([STUB_MAYAS_MONITOR]),
    "GET /api/v1/org-units/u1/positions": { status: 200, body: page([]) },
    ...extra,
  };
}

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
    await renderApp("/people?person=p1", { ...backend(), ...AS_VIEWER });
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
            : { status: 201, body: stubPerson("p9", "Dana Cohen") },
        "GET /api/v1/people/p9": { status: 200, body: stubPerson("p9", "Dana Cohen") },
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
            person: { ...STUB_MAYA, active: false },
            freed_seats: [
              { seat_id: "d2", holder_person_id: "p1", holder_unit_id: null },
              { seat_id: "d7", holder_person_id: "p1", holder_unit_id: null },
            ],
          },
        },
        "POST /api/v1/people/p1/reactivate": { status: 200, body: STUB_MAYA },
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
