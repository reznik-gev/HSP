// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { AS_VIEWER, renderApp, type Routes } from "@/test/renderApp";
import { page, STUB_MAYA, STUB_MAYAS_MONITOR, stubDevice, stubDeviceRoutes } from "@/test/stubs";

/** A docking station nobody has, not placed. */
const LOOSE = stubDevice("dev2", "DOCK-0007");

function backend(extra: Routes = {}): Routes {
  return {
    ...stubDeviceRoutes([STUB_MAYAS_MONITOR, LOOSE]),
    "GET /api/v1/people/p1": { status: 200, body: STUB_MAYA },
    "GET /api/v1/people": { status: 200, body: page([STUB_MAYA]) },
    "GET /api/v1/org-units": { status: 200, body: page([]) },
    ...extra,
  };
}

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await act(() => i18n.changeLanguage("en"));
});

describe("devices (docs/0095)", () => {
  it("lists devices with who has them and where they're placed", async () => {
    await renderApp("/devices", backend());
    const row = await screen.findByRole("row", { name: /MON-0412/ });
    expect(row).toHaveTextContent("SN-77");
    expect(await within(row).findByText("Maya Shani")).toBeVisible();
    expect(row).toHaveTextContent("Floor 3");
    expect(within(row).getByRole("link", { name: "Show on plan" })).toHaveAttribute(
      "href",
      "/floors/f3?seat=m1",
    );
    expect(screen.getByRole("row", { name: /DOCK-0007/ })).toHaveTextContent("–");
  });

  it("searches and filters on the server", async () => {
    const { calls, router } = await renderApp("/devices", backend());
    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: "Placed or not" }),
      "Not placed",
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Issued or not" }),
      "Issued to someone",
    );
    await userEvent.type(screen.getByRole("searchbox", { name: /asset tag/ }), "MON");
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ placed: "no", issued: "yes", q: "MON" }),
    );
    await waitFor(() =>
      expect(
        calls.some((r) => {
          const q = new URL(r.url).searchParams;
          return q.get("placed") === "false" && q.get("issued") === "true" && q.get("q") === "MON";
        }),
      ).toBe(true),
    );
  });

  it("adds a device issued to someone", async () => {
    let sent: unknown;
    const { router } = await renderApp(
      "/devices",
      backend({
        "POST /api/v1/devices": (request) => {
          void request
            .clone()
            .json()
            .then((b: unknown) => (sent = b));
          return { status: 201, body: stubDevice("dev9", "LAP-1") };
        },
        "GET /api/v1/devices/dev9": {
          status: 200,
          body: stubDevice("dev9", "LAP-1"),
        },
      }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "New device" }));
    const panel = await screen.findByRole("dialog", { name: "New device" });
    await userEvent.type(within(panel).getByRole("textbox", { name: "Asset tag" }), "LAP-1");
    await userEvent.type(
      within(panel).getByRole("combobox", { name: "Who it's issued to" }),
      "Maya",
    );
    await userEvent.click(await within(panel).findByRole("option", { name: /Maya Shani/ }));
    expect(within(panel).getByText("Maya Shani")).toBeVisible();
    await userEvent.click(within(panel).getByRole("button", { name: "Add device" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ device: "dev9" }));
    expect(sent).toEqual({
      asset_tag: "LAP-1",
      serial_number: null,
      notes: null,
      assigned_person_id: "p1",
    });
  });

  it("explains an asset tag that's taken", async () => {
    await renderApp(
      "/devices?device=dev2",
      backend({
        "PATCH /api/v1/devices/dev2": {
          status: 409,
          body: { status: 409, type: "/problems/asset-tag-taken", title: "Asset tag already used" },
        },
      }),
    );
    const panel = await screen.findByRole("dialog", { name: "DOCK-0007" });
    const tag = within(panel).getByRole("textbox", { name: "Asset tag" });
    await userEvent.clear(tag);
    await userEvent.type(tag, "MON-0412");
    await userEvent.click(within(panel).getByRole("button", { name: "Save" }));
    expect(await within(panel).findByText("Another device has this asset tag.")).toBeVisible();
  });

  it("says why a placed device can't be deleted", async () => {
    await renderApp(
      "/devices?device=dev1",
      backend({
        "DELETE /api/v1/devices/dev1": {
          status: 409,
          body: { status: 409, type: "/problems/in-use", title: "Device in use" },
        },
      }),
    );
    const panel = await screen.findByRole("dialog", { name: "MON-0412" });
    expect(panel).toHaveTextContent("Floor 3");
    await userEvent.click(within(panel).getByRole("button", { name: "Delete" }));
    expect(await within(panel).findByRole("alert")).toHaveTextContent("in a floor's history");
  });

  it("deletes an unplaced device at once, and Undo adds it back", async () => {
    const calls: string[] = [];
    await renderApp(
      "/devices?device=dev2",
      backend({
        "DELETE /api/v1/devices/dev2": () => {
          calls.push("delete");
          return { status: 204 };
        },
        "POST /api/v1/devices": () => {
          calls.push("add");
          return { status: 201, body: stubDevice("dev3", "DOCK-0007") };
        },
      }),
    );
    const panel = await screen.findByRole("dialog", { name: "DOCK-0007" });
    await userEvent.click(within(panel).getByRole("button", { name: "Delete" }));
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(calls).toEqual(["delete", "add"]));
  });

  it("isn't offered to viewers", async () => {
    await renderApp("/devices", { ...backend(), ...AS_VIEWER });
    expect(await screen.findByText("Only administrators can manage devices.")).toBeVisible();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).queryByRole("link", { name: "Devices" })).toBeNull();
  });
});
