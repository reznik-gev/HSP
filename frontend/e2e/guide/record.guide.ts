/**
 * Records the frames of each guide GIF (docs/0146), against the Northwind demo, with Chrome's
 * screencast: test-results/guide-frames/<name>/, and <name>.ffconcat saying how long each frame
 * shows. to-gif.ts turns them into GIFs with ffmpeg. Run with `pnpm guide:gifs`.
 *
 * Playwright's videos show no mouse pointer, so the page gets a drawn one, and the pointer glides
 * to what it clicks, so the viewer can follow.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  type APIRequestContext,
  type Browser,
  expect,
  type Locator,
  type Page,
  test,
} from "@playwright/test";

import { signIn } from "../session";

const SIZE = { width: 1000, height: 620 };
const OUT = "test-results/guide-frames";
const STATE = "test-results/guide-frames/state.json";
const API = "/api/v1";

/** Floors and people from the demo's seed (deploy/demo/seed.py). */
const FLOOR_3 = "Floor 3";
const FLOOR_5 = "Floor 5";

/** A drawn pointer that follows the mouse, and shrinks a little while pressed. */
const POINTER = `
addEventListener("DOMContentLoaded", () => {
  const p = document.createElement("div");
  p.style.cssText = "position:fixed;left:0;top:0;width:20px;height:20px;z-index:2147483647;" +
    "pointer-events:none;transition:transform 60ms;transform-origin:0 0";
  p.innerHTML = '<svg width="20" height="20" viewBox="0 0 20 20"><path d="M2 1 L2 16 L6 12 L9 19 ' +
    'L11.5 18 L8.5 11 L14 11 Z" fill="#111" stroke="#fff" stroke-width="1.3"/></svg>';
  document.body.appendChild(p);
  addEventListener("mousemove", (e) => { p.style.left = e.clientX + "px"; p.style.top = e.clientY + "px"; }, true);
  addEventListener("mousedown", () => { p.style.transform = "scale(0.85)"; }, true);
  addEventListener("mouseup", () => { p.style.transform = ""; }, true);
});`;

let pointer = { x: SIZE.width / 2, y: SIZE.height / 2 };

async function glide(page: Page, x: number, y: number) {
  const steps = Math.max(8, Math.round(Math.hypot(x - pointer.x, y - pointer.y) / 18));
  await page.mouse.move(x, y, { steps });
  pointer = { x, y };
}

async function clickAt(page: Page, x: number, y: number) {
  await glide(page, x, y);
  await page.waitForTimeout(150);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(350);
}

async function click(page: Page, target: Locator) {
  const box = (await target.boundingBox())!;
  await clickAt(page, box.x + box.width / 2, box.y + box.height / 2);
}

/** Screen position of a plan point (mm, +y north), read from the plan's viewBox. */
async function planPoint(page: Page) {
  const svg = page.locator("svg[data-lod]");
  const box = (await svg.boundingBox())!;
  const [vx, vy, vw, vh] = (await svg.getAttribute("viewBox"))!.split(" ").map(Number) as [
    number,
    number,
    number,
    number,
  ];
  return (x: number, y: number) =>
    [box.x + ((x - vx) / vw) * box.width, box.y + ((-y - vy) / vh) * box.height] as const;
}

/** The admin's API, with the CSRF token writes need. */
async function api(request: APIRequestContext) {
  const me = (await (await request.get(`${API}/auth/me`)).json()) as { csrf_token: string };
  const headers = { "X-CSRF-Token": me.csrf_token };
  return {
    get: async <T>(path: string) => {
      const r = await request.get(API + path);
      expect(r.ok(), `GET ${path}`).toBeTruthy();
      return (await r.json()) as T;
    },
    send: async (method: "post" | "put" | "delete", path: string, data?: unknown) => {
      const r = await request[method](API + path, { data, headers });
      expect(r.ok(), `${method} ${path}: ${await r.text()}`).toBeTruthy();
    },
    status: async (path: string) => (await request.get(API + path)).status(),
  };
}

type Floor = { id: string; name: string };

async function floorId(page: Page, name: string) {
  const floors = await (await api(page.request)).get<{ items: Floor[] }>("/floors?limit=100");
  return floors.items.find((f) => f.name === name)!.id;
}

/**
 * Record one GIF's video. `scene` gets the page, a `start` to call once the screen is ready and
 * a `stop` to call when the GIF should end: what comes before `start` and after `stop` is cut,
 * such as tidying the demo up.
 */
async function record(
  browser: Browser,
  name: string,
  scene: (page: Page, start: () => void, stop: () => void) => Promise<void>,
) {
  const context = await browser.newContext({ viewport: SIZE, storageState: STATE });
  await context.addInitScript(POINTER);
  const page = await context.newPage();
  pointer = { x: SIZE.width / 2, y: SIZE.height / 2 };
  await page.mouse.move(pointer.x, pointer.y);

  // Chrome sends a frame each time the page changes, with the time it was drawn.
  const frames: { at: number; data: string }[] = [];
  const cdp = await context.newCDPSession(page);
  cdp.on("Page.screencastFrame", (f) => {
    frames.push({ at: f.metadata.timestamp ?? Date.now() / 1000, data: f.data });
    void cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", {
    format: "png",
    maxWidth: SIZE.width,
    maxHeight: SIZE.height,
  });

  let start = 0;
  let end = 0;
  const now = () => Date.now() / 1000;
  await scene(
    page,
    () => (start = now()),
    () => (end = now()),
  );
  end ||= now();
  await cdp.send("Page.stopScreencast");
  await context.close();

  // Keep the frames between start and stop, and the one showing when start came.
  const shown = frames.filter((f) => f.at < end);
  const first = Math.max(
    0,
    shown.findLastIndex((f) => f.at <= start),
  );
  const kept = shown.slice(first);
  const dir = join(OUT, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const list = ["ffconcat version 1.0"];
  kept.forEach((f, i) => {
    const file = `${String(i).padStart(4, "0")}.png`;
    writeFileSync(join(dir, file), Buffer.from(f.data, "base64"));
    const next = kept[i + 1]?.at ?? end;
    list.push(
      `file '${name}/${file}'`,
      `duration ${Math.max(0.02, next - Math.max(f.at, start)).toFixed(3)}`,
    );
  });
  // ffconcat ignores the last duration unless the last file is listed again.
  list.push(`file '${name}/${String(kept.length - 1).padStart(4, "0")}.png'`);
  writeFileSync(join(OUT, `${name}.ffconcat`), list.join("\n") + "\n");
}

test.beforeAll(async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, "dana.levin", "demo");
  await context.storageState({ path: STATE });
  await context.close();
});

test("find-a-seat", async ({ browser }) => {
  await record(browser, "find-a-seat", async (page, start) => {
    await page.goto("/floors");
    await expect(page.getByRole("link", { name: FLOOR_3 })).toBeVisible();
    start();
    await page.waitForTimeout(600);
    await click(page, page.getByRole("searchbox", { name: "Search seats, people and teams" }));
    await page.keyboard.type("Amira", { delay: 120 });
    await page.waitForTimeout(400);
    await page.keyboard.press("Enter");
    const show = page.getByRole("link", { name: /Show .* on the floor plan/ }).first();
    await expect(show).toBeVisible();
    await page.waitForTimeout(900);
    await click(page, show);
    await expect(page.getByText("Amira Haddad").last()).toBeVisible();
    await page.waitForTimeout(2200);
  });
});

test("free-seats", async ({ browser }) => {
  await record(browser, "free-seats", async (page, start) => {
    await page.goto(`/floors/${await floorId(page, FLOOR_3)}`);
    const button = page.getByRole("button", { name: /Show free seats/ });
    await expect(button).toBeVisible();
    await page.waitForTimeout(800);
    start();
    await page.waitForTimeout(700);
    await click(page, button);
    await page.waitForTimeout(2500);
  });
});

/** The editor on Floor 5, which has no plan in the demo. */
async function openEditor(page: Page) {
  await page.goto(`/floors/${await floorId(page, FLOOR_5)}/edit`);
  await expect(page.getByRole("heading", { name: `Editing ${FLOOR_5}` })).toBeVisible();
  await page.waitForTimeout(800);
}

/** Leave the editor, giving up the edit lock, so the next scene can take it. */
async function exitEditor(page: Page) {
  await expect(page.getByText(/Saved/).first()).toBeVisible();
  await page.getByRole("button", { name: "Exit" }).click();
  await page.waitForURL(/\/floors\/[^/]+$/);
}

test("draw-walls", async ({ browser }) => {
  await record(browser, "draw-walls", async (page, start, stop) => {
    const id = await floorId(page, FLOOR_5);
    expect(
      await (await api(page.request)).status(`/floors/${id}/draft`),
      "Floor 5 already has a draft",
    ).toBe(404);
    await openEditor(page);
    start();
    await click(page, page.getByRole("button", { name: "Wall", exact: true }));
    const at = await planPoint(page);
    for (const [x, y] of [
      [-5000, -3000],
      [5000, -3000],
      [5000, 3000],
      [-5000, 3000],
      [-5000, -3000],
    ] as const) {
      await clickAt(page, ...at(x, y));
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(500);
    // A door in the bottom wall.
    await click(page, page.getByRole("button", { name: "Door", exact: true }));
    const door = await planPoint(page);
    await clickAt(page, ...door(-3500, -3000));
    await page.waitForTimeout(1800);
    stop();
    await page.keyboard.press("Escape");
    await exitEditor(page);
  });
});

test("place-desks", async ({ browser }) => {
  await record(browser, "place-desks", async (page, start, stop) => {
    await openEditor(page);
    start();
    await click(page, page.getByRole("button", { name: "Place item", exact: true }));
    await page.waitForTimeout(400);
    await click(page, page.getByRole("button", { name: /Desk 160 x 80/ }).first());
    const at = await planPoint(page); // the catalog panel narrowed the plan
    for (const x of [-2400, -800, 800, 2400]) await clickAt(page, ...at(x, 1000));
    await page.waitForTimeout(500);
    await click(page, page.getByRole("button", { name: "Number seats", exact: true }));
    const n = await planPoint(page);
    const [x0, y0] = n(-2700, 1000);
    const [x1, y1] = n(2700, 1000);
    await glide(page, x0, y0);
    await page.mouse.down();
    await glide(page, x1, y1);
    await page.mouse.up();
    await page.waitForTimeout(2200);
    stop();
    await page.keyboard.press("Escape");
    await exitEditor(page);
  });
});

test("publish", async ({ browser }) => {
  await record(browser, "publish", async (page, start, stop) => {
    const id = await floorId(page, FLOOR_5);
    try {
      await openEditor(page);
      start();
      await click(page, page.getByRole("button", { name: "Publish", exact: true }));
      const dialog = page.getByRole("alertdialog");
      await expect(dialog.getByText(/Added:/)).toBeVisible();
      await page.waitForTimeout(1200);
      await click(page, dialog.getByLabel(/Note/));
      await page.keyboard.type("First layout of the fifth floor", { delay: 60 });
      await page.waitForTimeout(500);
      await glide(
        page,
        ...(await centre(dialog.getByRole("button", { name: "Publish", exact: true }))),
      );
      await page.waitForTimeout(1500);
      stop();
      // Not published: the demo stays as it was.
      await page.keyboard.press("Escape");
      await exitEditor(page);
    } finally {
      // Throw the drawing away, even when the scene failed partway.
      const demo = await api(page.request);
      await demo.send("post", `/floors/${id}/lock`);
      await demo.send("delete", `/floors/${id}/draft`);
      await demo.send("delete", `/floors/${id}/lock`);
    }
  });
});

async function centre(target: Locator) {
  const box = (await target.boundingBox())!;
  return [box.x + box.width / 2, box.y + box.height / 2] as const;
}

type Seat = { id: string; label: string };

test("assign-seat", async ({ browser }) => {
  await record(browser, "assign-seat", async (page, start, stop) => {
    const demo = await api(page.request);
    const floor = await floorId(page, FLOOR_3);
    const seat = (await demo.get<{ items: Seat[] }>(`/seats?floor_id=${floor}&status=free`))
      .items[0]!;
    await page.goto(`/floors/${floor}?seat=${seat.id}`);
    const assign = page.getByRole("button", { name: "Assign", exact: true });
    await expect(assign).toBeVisible();
    await page.waitForTimeout(800);
    start();
    await page.waitForTimeout(500);
    await click(page, assign);
    // Every person in the demo has a seat, so the seat is reserved for a team.
    await click(page, page.getByRole("combobox", { name: "Person or team" }));
    await page.keyboard.type("Design", { delay: 120 });
    const option = page.getByRole("option", { name: /Design/ }).first();
    await expect(option).toBeVisible();
    await page.waitForTimeout(500);
    await click(page, option);
    await expect(page.getByText(`${seat.label} reserved for Design`)).toBeVisible();
    await page.waitForTimeout(2200);
    stop();
    // Give the seat back, so the demo stays as it was.
    await demo.send("delete", `/seats/${seat.id}/assignment`);
  });
});
