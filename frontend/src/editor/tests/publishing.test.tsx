// @vitest-environment jsdom
/** Publishing, discarding and version history (docs/0082, docs/0089). */
import { act, cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import {
  STUB_EDITED_DESK,
  STUB_NO_DRAFT,
  stubEditorRoutes,
  stubFloor3Plan,
  stubSaved,
  withEditedDesk,
} from "@/test/editorStubs";
import { renderApp, type Reply } from "@/test/renderApp";
import { page, STUB_MAYA, stubPersonHolder, stubProblem, stubSeat } from "@/test/stubs";

const PUBLISH_CONFLICTS = stubProblem(409, "publish-conflicts", {
  errors: [{ code: "seat_label_duplicate", message: "A-01 is used twice.", element_id: "d1" }],
});
const EMPTY_DIFF = { added: [], changed: [], removed: [] };
/** Draft 3 against version 2: the desk added, Maya's seat d9 removed. */
const DRAFT_DIFF = {
  floor_id: "f3",
  from_version: 2,
  to_version: 3,
  walls: EMPTY_DIFF,
  openings: EMPTY_DIFF,
  columns: EMPTY_DIFF,
  zones: EMPTY_DIFF,
  objects: { added: [STUB_EDITED_DESK], changed: [], removed: [{ id: "d9" }] },
};
/** Maya's seat B-02, which the draft removes. */
const MAYAS_SEAT = stubSeat("d9", "B-02", stubPersonHolder(STUB_MAYA));
const PUBLISHED_AS_3 = {
  floor_id: "f3",
  published_version: 3,
  superseded_version: 2,
  freed_seats: [{ seat_id: "d9" }],
};
/** Version 1 (superseded), 2 (published) and draft 3. */
const VERSIONS = [
  {
    version: 1,
    state: "superseded",
    revision: 2,
    created_at: "2026-10-01T09:00:00Z",
    created_by: "u-1",
    published_at: "2026-10-01T10:00:00Z",
    note: "First",
  },
  {
    version: 2,
    state: "published",
    revision: 5,
    created_at: "2026-10-10T09:00:00Z",
    created_by: "u-1",
    published_at: "2026-10-10T10:00:00Z",
    note: null,
  },
  {
    version: 3,
    state: "draft",
    revision: 3,
    created_at: "2026-10-15T09:00:00Z",
    created_by: "u-1",
    published_at: null,
    note: null,
  },
];

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await act(() => i18n.changeLanguage("en"));
});

describe("publishing, discarding and history (docs/0082, docs/0089)", () => {
  function publishing(publish: Reply) {
    const published: unknown[] = [];
    const routes = stubEditorRoutes({
      "GET /api/v1/floors/f3/draft": {
        status: 200,
        body: withEditedDesk(stubFloor3Plan(3, "draft")),
      },
      "GET /api/v1/floors/f3/versions/2/diff/3": { status: 200, body: DRAFT_DIFF },
      "GET /api/v1/seats": { status: 200, body: page([MAYAS_SEAT]) },
      "POST /api/v1/floors/f3/draft/publish": (request) => {
        void request.json().then((b) => published.push(b));
        return publish;
      },
    });
    return { routes, published };
  }

  it("Publish shows what changed and which seats it frees, then goes to the floor", async () => {
    const { routes, published } = publishing({ status: 200, body: PUBLISHED_AS_3 });
    await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Publish Floor 3" });
    const lines = await within(dialog).findAllByRole("listitem");
    expect(lines.map((l) => l.textContent)).toEqual(
      expect.arrayContaining(["Added: 1 item", "Removed: 1 item"]),
    );
    expect(within(dialog).getByText("1 assigned seat will be freed:")).toBeVisible();
    expect(within(dialog).getByText(/B-02: Maya Shani/)).toBeVisible();
    await userEvent.type(within(dialog).getByLabelText(/Note/), "New desks");
    await userEvent.click(within(dialog).getByRole("button", { name: "Publish" }));
    expect(await screen.findByRole("heading", { name: "Floor 3" })).toBeVisible();
    expect(published).toEqual([{ base_revision: 3, note: "New desks" }]);
    expect(await screen.findByText("Floor 3 published as version 3")).toBeVisible();
  });

  it("publish conflicts are listed in Problems", async () => {
    const { routes } = publishing(PUBLISH_CONFLICTS);
    await renderApp("/floors/f3/edit", routes);
    await screen.findByText("Draft 3 · Saved");
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(await within(dialog).findByRole("button", { name: "Publish" }));
    const panel = await screen.findByRole("complementary", { name: "Problems" });
    expect(
      within(panel).getByText("Another seat in this building has the same label."),
    ).toBeVisible();
    expect(within(panel).getByText("Seat A-01")).toBeVisible();
  });

  it("Discard draft goes back to the published plan; Undo brings the draft back", async () => {
    let draft: unknown = withEditedDesk(stubFloor3Plan(3, "draft"));
    const restored: { base_revision: number; ops: { op: string; id: string }[] }[] = [];
    await renderApp(
      "/floors/f3/edit",
      stubEditorRoutes({
        "GET /api/v1/floors/f3/draft": () => (draft ? { status: 200, body: draft } : STUB_NO_DRAFT),
        "DELETE /api/v1/floors/f3/draft": () => {
          draft = null;
          return { status: 204 };
        },
        "POST /api/v1/floors/f3/draft/changesets": (request) => {
          void request.json().then((b) => restored.push(b as never));
          draft = withEditedDesk(stubFloor3Plan(3, "draft"));
          return { status: 200, body: stubSaved(4) };
        },
      }),
    );
    await screen.findByText("Draft 3 · Saved");
    await userEvent.click(screen.getByRole("button", { name: "Discard draft" }));
    expect(await screen.findByText("Published version 2 · no changes yet")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Discard draft" })).toBeNull();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    const notice = (await screen.findByText(/Draft discarded/)).closest("li")!;
    await userEvent.click(within(notice).getByRole("button", { name: "Undo" }));
    // The published plan has the wall; the draft added the desk.
    expect(restored).toEqual([
      { base_revision: 0, ops: [expect.objectContaining({ op: "add", kind: "object", id: "d1" })] },
    ]);
  });

  it("History lists the versions; Restore waits for the draft to go", async () => {
    await renderApp(
      "/floors/f3/edit",
      stubEditorRoutes({
        "GET /api/v1/floors/f3/versions": { status: 200, body: page(VERSIONS) },
      }),
    );
    await screen.findByText("Draft 3 · Saved");
    await userEvent.click(screen.getByRole("button", { name: "Version history" }));
    const sheet = await screen.findByRole("dialog", { name: "Version history" });
    const items = await within(sheet).findAllByRole("listitem");
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining("Version 3 · Draft"),
      expect.stringContaining("Version 2 · Published"),
      expect.stringMatching(/Version 1 · Earlier.*First/),
    ]);
    expect(within(sheet).getByRole("button", { name: "Restore" })).toBeDisabled();
    expect(within(sheet).getByText(/Publish or discard the current draft/)).toBeVisible();
  });
});
