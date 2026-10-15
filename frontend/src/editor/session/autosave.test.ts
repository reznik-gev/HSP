import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiPlan, Op } from "@/editor/core/operations";
import { createEditorStore } from "@/editor/core/store";

import { Autosave, RETRY_MS, SAVE_DELAY_MS } from "./autosave";

const DESK = { id: "d1", catalog_item_rev_id: "rev", position: [0, 0, 0], rotation_ddeg: 0 };
const PLAN = {
  floor_id: "f3",
  version: 2,
  state: "published",
  revision: 4,
  walls: [],
  openings: [],
  columns: [],
  zones: [],
  objects: [DESK],
  catalog: {
    rev: {
      id: "rev",
      key: "desk",
      category: "desk",
      shape: "box",
      width_mm: 1600,
      depth_mm: 800,
      height_mm: 740,
      color: null,
      is_seat: true,
    },
  },
} as unknown as ApiPlan;
const label = (l: string): Op[] => [{ op: "update", kind: "object", id: "d1", data: { label: l } }];
type Reply = { status: number; body?: unknown };
const URL_ = "POST /api/v1/floors/f3/draft/changesets";
const problem = (status: number, slug: string): Reply => ({
  status,
  body: { type: `https://hsp.example/problems/${slug}`, title: slug },
});

function setup(replies: (Reply | "network")[], base = { revision: 0, version: null }) {
  const bodies: { base_revision: number; ops: Op[] }[] = [];
  const fetchMock = vi.fn(async (request: Request) => {
    expect(`${request.method} ${new URL(request.url).pathname}`).toBe(URL_);
    const body = request.json().then((b) => void bodies.push(b as never));
    await body;
    const reply = replies.shift() ?? { status: 200, body: { revision: 9, version: 3 } };
    if (reply === "network") throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  const store = createEditorStore();
  store.getState().loadDocument(PLAN, new Map());
  const events = { onStale: vi.fn(), onLockLost: vi.fn(), onRejected: vi.fn() };
  const autosave = new Autosave(store, "f3", base, events);
  return { store, autosave, events, bodies };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const ok = (revision: number): Reply => ({ status: 200, body: { revision, version: 3 } });

describe("autosave (docs/0089 choice 3, docs/0090)", () => {
  it("sends a second after the last change, one changeset per change, in order", async () => {
    const { store, autosave, bodies } = setup([ok(1), ok(2)]);
    store.getState().perform(label("A"));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS / 2);
    store.getState().perform(label("B"));
    expect(autosave.state.getState().status).toBe("pending");
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    // Each builds on the revision the server returned for the one before.
    expect(bodies).toEqual([
      { base_revision: 0, ops: label("A") },
      { base_revision: 1, ops: label("B") },
    ]);
    expect(autosave.state.getState()).toEqual({ status: "saved", version: 3 });
    expect(store.getState().pending).toEqual([]);
  });

  it("flush sends at once, e.g. on Exit", async () => {
    const { store, autosave, bodies } = setup([]);
    store.getState().perform(label("A"));
    await autosave.flush();
    expect(bodies).toHaveLength(1);
    expect(autosave.state.getState().status).toBe("saved");
  });

  it("a network failure keeps the changes and retries", async () => {
    const { store, autosave, bodies } = setup(["network"]);
    store.getState().perform(label("A"));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(autosave.state.getState().status).toBe("offline");
    store.getState().perform(label("B"));
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    expect(bodies.map((b) => b.ops)).toEqual([label("A"), label("A"), label("B")]);
    expect(autosave.state.getState().status).toBe("saved");
  });

  it("a lost lock pauses saving and keeps the changes until resumed", async () => {
    const { store, autosave, events, bodies } = setup([problem(423, "floor-locked")]);
    store.getState().perform(label("A"));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(events.onLockLost).toHaveBeenCalledOnce();
    expect(autosave.state.getState().status).toBe("paused");
    store.getState().perform(label("B"));
    await vi.advanceTimersByTimeAsync(RETRY_MS * 2);
    expect(bodies).toHaveLength(1);
    autosave.resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(bodies.slice(1).map((b) => b.ops)).toEqual([label("A"), label("B")]);
  });

  it("a stale draft hands over to the editor and stops", async () => {
    const { store, events, bodies } = setup([problem(409, "stale-revision")]);
    store.getState().perform(label("A"));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(events.onStale).toHaveBeenCalledOnce();
    store.getState().perform(label("B"));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 3);
    expect(bodies).toHaveLength(1);
  });

  it("a refused change is taken back and reported; saving goes on with the next", async () => {
    const { store, events, bodies } = setup([problem(422, "changeset-invalid"), ok(1)]);
    store.getState().perform(label("A"));
    store
      .getState()
      .perform([{ op: "update", kind: "object", id: "d1", data: { rotation_ddeg: 900 } }]);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(events.onRejected).toHaveBeenCalledWith(
      expect.objectContaining({ title: "changeset-invalid" }),
      expect.objectContaining({ ops: label("A") }),
      [],
    );
    expect(bodies.map((b) => b.base_revision)).toEqual([0, 0]);
    expect(store.getState().plan!.objects.d1).toMatchObject({ label: null, rotation_ddeg: 900 });
  });
});
