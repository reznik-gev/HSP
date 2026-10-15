// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { AS_VIEWER, renderApp, type Routes } from "@/test/renderApp";
import {
  STUB_DESK_ITEM,
  STUB_MONITOR_ITEM,
  stubCatalogItemOut,
  stubCatalogRoutes,
  stubCustomItemOut,
} from "@/test/stubs";

const DESK = stubCatalogItemOut(STUB_DESK_ITEM);

/** Two built-in items, the organisation's lab bench (i9) and an archived bench (i8). */
const backend = (extra: Routes = {}): Routes => ({
  ...stubCatalogRoutes([
    DESK,
    stubCatalogItemOut(STUB_MONITOR_ITEM),
    stubCustomItemOut("i9"),
    stubCustomItemOut("i8", { name: "Old bench", archived_at: "2026-10-01T00:00:00Z" }),
  ]),
  ...extra,
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await act(() => i18n.changeLanguage("en"));
});

describe("the catalog (docs/0095)", () => {
  it("lists items by category, with their size and flags", async () => {
    await renderApp("/catalog", backend());
    const desks = await screen.findByRole("region", { name: "Desks" });
    expect(desks).toHaveTextContent("Desk 160 x 80");
    expect(desks).toHaveTextContent("160 × 80 × 74 cm");
    expect(desks).toHaveTextContent("Seat");
    const monitors = screen.getByRole("region", { name: "Monitors" });
    expect(monitors).toHaveTextContent("Attaches to Desks");
    // A category of the organisation's own shows as typed.
    expect(screen.getByRole("region", { name: "lab bench" })).toHaveTextContent("Lab bench");
  });

  it("searches, and shows only the organisation's own items or the archived ones", async () => {
    const { router, calls } = await renderApp("/catalog", backend());
    await userEvent.type(
      await screen.findByRole("searchbox", { name: "Search the catalog" }),
      "mon",
    );
    await waitFor(() => expect(screen.queryByRole("region", { name: "Desks" })).toBeNull());
    expect(screen.getByRole("region", { name: "Monitors" })).toBeVisible();

    await userEvent.clear(screen.getByRole("searchbox", { name: "Search the catalog" }));
    // The search applies after a short pause; wait for it to clear before filtering.
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("q"));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Show" }), "Our own");
    await waitFor(() => expect(router.state.location.search).toMatchObject({ show: "custom" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Monitors" })).toBeNull());
    expect(await screen.findByText("Lab bench")).toBeVisible();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Show" }), "Archived");
    expect(await screen.findByText("Old bench")).toBeVisible();
    expect(screen.queryByText("Lab bench")).toBeNull();
    expect(calls.some((r) => new URL(r.url).searchParams.get("include_archived") === "true")).toBe(
      true,
    );
  });

  it("opens a built-in item read-only, and copies it into the organisation's own", async () => {
    const posted: Promise<{ key: string; name: string }>[] = [];
    const copy = {
      ...DESK,
      id: "i20",
      key: "desk_copy_2",
      name: "Desk 160 x 80 (copy)",
      builtin: false,
    };
    const { router } = await renderApp(
      "/catalog",
      backend({
        "POST /api/v1/catalog-items": (request) => {
          posted.push(request.clone().json() as Promise<{ key: string; name: string }>);
          // The first key is taken (an earlier copy), so the next one is tried.
          return posted.length === 1
            ? {
                status: 409,
                body: { status: 409, type: "/problems/key-taken", title: "Key taken" },
              }
            : { status: 201, body: copy };
        },
        "GET /api/v1/catalog-items/i20": { status: 200, body: copy },
      }),
    );
    await userEvent.click(await screen.findByRole("link", { name: "Desk 160 x 80" }));
    const panel = await screen.findByRole("dialog", { name: "Desk 160 x 80" });
    expect(panel).toHaveTextContent("can't be changed");
    expect(within(panel).getByRole("img", { name: "Desk 160 x 80 seen from above" })).toBeVisible();

    await userEvent.click(within(panel).getByRole("button", { name: "Make a copy" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ item: "i20" }));
    const bodies = await Promise.all(posted);
    expect(bodies.map((b) => b.key)).toEqual(["desk_copy", "desk_copy_2"]);
    expect(bodies[1]?.name).toBe("Desk 160 x 80 (copy)");
    expect(await screen.findByRole("dialog", { name: "Desk 160 x 80 (copy)" })).toBeVisible();
  });

  it("isn't offered to viewers", async () => {
    await renderApp("/catalog", { ...backend(), ...AS_VIEWER });
    expect(await screen.findByText("Only administrators can manage the catalog.")).toBeVisible();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).queryByRole("link", { name: "Catalog" })).toBeNull();
  });
});

describe("the organisation's own items (docs/0095)", () => {
  it("creates an item from the form, with a key from its name", async () => {
    let sent: Record<string, unknown> | undefined;
    const made = { ...BENCH, id: "i30", name: "Standing desk" };
    const { router } = await renderApp(
      "/catalog",
      backend({
        "POST /api/v1/catalog-items": (request) => {
          void request
            .clone()
            .json()
            .then((b: Record<string, unknown>) => (sent = b));
          return { status: 201, body: made };
        },
        "GET /api/v1/catalog-items/i30": { status: 200, body: made },
      }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "New item" }));
    const panel = await screen.findByRole("dialog", { name: "New item" });
    await userEvent.type(within(panel).getByRole("textbox", { name: "Name" }), "Standing desk");
    await userEvent.type(within(panel).getByRole("combobox", { name: "Category" }), "desk");
    await userEvent.type(within(panel).getByRole("spinbutton", { name: "Width (cm)" }), "140");
    await userEvent.type(within(panel).getByRole("spinbutton", { name: "Depth (cm)" }), "70.5");
    await userEvent.type(within(panel).getByRole("spinbutton", { name: "Height (cm)" }), "110");
    await userEvent.click(within(panel).getByRole("checkbox", { name: /A seat/ }));
    await userEvent.click(within(panel).getByRole("button", { name: "Create item" }));

    await waitFor(() => expect(router.state.location.search).toMatchObject({ item: "i30" }));
    expect(sent).toMatchObject({
      key: "standing_desk",
      name: "Standing desk",
      category: "desk",
      width_mm: 1400,
      depth_mm: 705,
      height_mm: 1100,
      is_seat: true,
      footprint_blocks: true,
    });
  });

  it("warns that placed items keep their size only when the change makes a new revision", async () => {
    let sent: Record<string, unknown> | undefined;
    await renderApp(
      "/catalog?item=i9",
      backend({
        "GET /api/v1/catalog-items/i9": { status: 200, body: BENCH },
        "PATCH /api/v1/catalog-items/i9": (request) => {
          void request
            .clone()
            .json()
            .then((b: Record<string, unknown>) => (sent = b));
          return { status: 200, body: { ...BENCH, name: "Lab bench, long" } };
        },
      }),
    );
    const panel = await screen.findByRole("dialog", { name: "Lab bench" });
    const name = within(panel).getByRole("textbox", { name: "Name" });
    await userEvent.type(name, ", long");
    expect(within(panel).queryByRole("note")).toBeNull();

    const width = within(panel).getByRole("spinbutton", { name: "Width (cm)" });
    await userEvent.clear(width);
    await userEvent.type(width, "200");
    expect(within(panel).getByRole("note")).toHaveTextContent(
      "Items already on floors keep their current size",
    );
    await userEvent.click(within(panel).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sent).toMatchObject({ name: "Lab bench, long", width_mm: 2000 }));
  });

  it("explains a category the server refuses", async () => {
    await renderApp(
      "/catalog?new=true",
      backend({
        "POST /api/v1/catalog-items": {
          status: 422,
          body: {
            status: 422,
            title: "Invalid",
            errors: [{ code: "string_pattern_mismatch", message: "bad", pointer: "/category" }],
          },
        },
      }),
    );
    const panel = await screen.findByRole("dialog", { name: "New item" });
    await userEvent.type(within(panel).getByRole("textbox", { name: "Name" }), "Bench");
    await userEvent.type(within(panel).getByRole("combobox", { name: "Category" }), "9x");
    for (const f of ["Width (cm)", "Depth (cm)", "Height (cm)"]) {
      await userEvent.type(within(panel).getByRole("spinbutton", { name: f }), "50");
    }
    await userEvent.click(within(panel).getByRole("button", { name: "Create item" }));
    expect(
      await within(panel).findByText("Use English letters, digits and _, starting with a letter."),
    ).toBeVisible();
  });

  it("archives an item at once, with Undo", async () => {
    const calls: string[] = [];
    await renderApp(
      "/catalog?item=i9",
      backend({
        "GET /api/v1/catalog-items/i9": { status: 200, body: BENCH },
        "DELETE /api/v1/catalog-items/i9": () => {
          calls.push("archive");
          return { status: 204 };
        },
        "POST /api/v1/catalog-items/i9/restore": () => {
          calls.push("restore");
          return { status: 200, body: BENCH };
        },
      }),
    );
    const panel = await screen.findByRole("dialog", { name: "Lab bench" });
    await userEvent.click(within(panel).getByRole("button", { name: "Archive" }));
    expect(await screen.findByText("Lab bench archived.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(calls).toEqual(["archive", "restore"]));
    expect(await screen.findByText("Lab bench restored.")).toBeVisible();
  });
});
