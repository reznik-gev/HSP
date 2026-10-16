// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { ADMIN, renderApp, type Routes } from "@/test/renderApp";
import { page, STUB_DESK_ITEM, STUB_MONITOR_ITEM, stubCatalogItemOut } from "@/test/stubs";

const DESK = stubCatalogItemOut(STUB_DESK_ITEM);
const MONITOR = stubCatalogItemOut(STUB_MONITOR_ITEM);
/** The organisation's own item, in a category of its own. */
const BENCH = {
  ...stubCatalogItemOut({ ...STUB_DESK_ITEM, id: "rev-bench", item_id: "i9" }),
  key: "lab_bench",
  category: "lab_bench",
  name: "Lab bench",
  builtin: false,
};

function backend(extra: Routes = {}): Routes {
  return {
    "GET /api/v1/catalog-items": (request) => {
      const archived = new URL(request.url).searchParams.get("include_archived") === "true";
      const old = { ...BENCH, id: "i8", name: "Old bench", archived_at: "2026-10-01T00:00:00Z" };
      return {
        status: 200,
        body: page(archived ? [DESK, MONITOR, BENCH, old] : [DESK, MONITOR, BENCH]),
      };
    },
    "GET /api/v1/catalog-items/i1": { status: 200, body: DESK },
    ...extra,
  };
}

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
    await renderApp("/catalog", {
      ...backend(),
      "GET /api/v1/auth/me": { status: 200, body: { ...ADMIN, is_admin: false } },
    });
    expect(await screen.findByText("Only administrators can manage the catalog.")).toBeVisible();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).queryByRole("link", { name: "Catalog" })).toBeNull();
  });
});
