// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { renderApp, type Routes } from "@/test/renderApp";
import { page, STUB_ZONE_TYPES } from "@/test/stubs";

const [ROOM, MEETING] = STUB_ZONE_TYPES as [
  (typeof STUB_ZONE_TYPES)[number],
  (typeof STUB_ZONE_TYPES)[number],
];

function backend(extra: Routes = {}): Routes {
  return {
    "GET /api/v1/catalog-items": { status: 200, body: page([]) },
    "GET /api/v1/zone-types": { status: 200, body: page(STUB_ZONE_TYPES) },
    ...extra,
  };
}

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await act(() => i18n.changeLanguage("en"));
});

describe("zone types (docs/0095)", () => {
  it("are a second tab of the catalog, sorted by name", async () => {
    const { router } = await renderApp("/catalog", backend());
    await userEvent.click(await screen.findByRole("tab", { name: "Zone types" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: "zones" }));
    const panel = screen.getByRole("tabpanel");
    const names = within(panel)
      .getAllByRole("button")
      .map((b) => b.textContent)
      .filter((n) => n === ROOM.name || n === MEETING.name);
    expect(names).toEqual(["Meeting room", "Room"]);
    expect(panel).toHaveTextContent("Enclosed room");
  });

  it("adds one", async () => {
    let sent: unknown;
    const made = { id: "zt9", name: "Phone booth", color: "#cbd5e1", is_enclosed: true };
    const { router } = await renderApp(
      "/catalog?tab=zones",
      backend({
        "POST /api/v1/zone-types": (request) => {
          void request
            .clone()
            .json()
            .then((b: unknown) => (sent = b));
          return { status: 201, body: made };
        },
      }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "New zone type" }));
    const panel = await screen.findByRole("dialog", { name: "New zone type" });
    await userEvent.type(within(panel).getByRole("textbox", { name: "Name" }), "Phone booth");
    await userEvent.click(within(panel).getByRole("checkbox", { name: /An enclosed room/ }));
    await userEvent.click(within(panel).getByRole("button", { name: "Create zone type" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ zone: "zt9" }));
    expect(sent).toEqual({ name: "Phone booth", color: "#cbd5e1", is_enclosed: true });
  });

  it("says why one in use can't be deleted", async () => {
    await renderApp(
      "/catalog?tab=zones&zone=zt1",
      backend({
        "DELETE /api/v1/zone-types/zt1": {
          status: 409,
          body: { status: 409, type: "/problems/in-use", title: "Zone type in use" },
        },
      }),
    );
    const panel = await screen.findByRole("dialog", { name: "Room" });
    await userEvent.click(within(panel).getByRole("button", { name: "Delete" }));
    expect(await within(panel).findByRole("alert")).toHaveTextContent("You can rename it instead");
  });

  it("deletes an unused one at once, and Undo adds it back", async () => {
    const calls: string[] = [];
    const { router } = await renderApp(
      "/catalog?tab=zones&zone=zt2",
      backend({
        "DELETE /api/v1/zone-types/zt2": () => {
          calls.push("delete");
          return { status: 204 };
        },
        "POST /api/v1/zone-types": () => {
          calls.push("add");
          return { status: 201, body: { ...MEETING, id: "zt3" } };
        },
      }),
    );
    const panel = await screen.findByRole("dialog", { name: "Meeting room" });
    await userEvent.click(within(panel).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("zone"));
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(calls).toEqual(["delete", "add"]));
    expect(await screen.findByText("Meeting room added back.")).toBeVisible();
  });
});
