/**
 * SVG performance gate runner (docs/0052, docs/0073).
 *
 *   pnpm bench:svg                 # 1500 seats, all features (the 0052 worst case)
 *   pnpm bench:svg -- --seats 3000 # other sizes
 *
 * Builds the app in `bench` mode (production React), serves it with `vite preview`, drives
 * /bench/svg in the installed Google Chrome with real mouse input, and writes results to
 * bench/results/. Plain Node (type stripping): no TS-only runtime syntax in this file.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Page } from "playwright";
import { build, preview } from "vite";

type Vec2 = readonly [number, number];

interface FrameStats {
  frames: number;
  durationMs: number;
  avgFps: number;
  p95FrameMs: number;
  worstFrameMs: number;
}

interface Check {
  name: string;
  value: number;
  unit: string;
  limit: string;
  pass: boolean;
  detail?: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const args = process.argv.slice(2);
const argValue = (name: string, dflt: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? (args[i + 1] as string) : dflt;
};
const seats = Number(argValue("seats", "1500"));
const PORT = 4173;
const VIEWPORT = { width: 1600, height: 900 };
const STEP_MS = 16; // pace input at ~60 Hz, like a real mouse

/**
 * Pass limits. v1 uses LOWERED limits (docs/0074); docs/0052's original targets stay the goal
 * for 1.0 and are reported alongside: drag >= 50 fps, pan/zoom >= 45 fps.
 */
const LIMITS = {
  dragFps: 45, // 0052 target: 50
  panZoomFps: 35, // 0052 target: 45
  initialRenderMs: 1500,
  selectMs: 50,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function powerSource(): string {
  if (process.platform !== "win32") return "unknown";
  try {
    const out = execSync(
      'powershell -NoProfile -Command "(Get-CimInstance -Namespace root/wmi -ClassName BatteryStatus | Select-Object -First 1).PowerOnline"',
      { encoding: "utf8" },
    ).trim();
    return out === "True" ? "AC" : out === "False" ? "battery" : "unknown";
  } catch {
    return "unknown";
  }
}

async function bench<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate<T>(`window.__hspBench.${fn}`);
}

async function measure(page: Page, interact: () => Promise<void>): Promise<FrameStats> {
  await bench(page, "startRecording()");
  await interact();
  await sleep(100);
  return bench<FrameStats>(page, "stopRecording()");
}

async function dragFrom(
  page: Page,
  from: Vec2,
  dx: number,
  dy: number,
  steps = 90,
  button: "left" | "middle" = "left",
) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down({ button });
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from[0] + (dx * i) / steps, from[1] + (dy * i) / steps);
    await sleep(STEP_MS);
  }
  await page.mouse.up({ button });
}

async function loadBench(page: Page): Promise<number> {
  await page.goto(`http://localhost:${PORT}/bench/svg?seats=${seats}`);
  await page.waitForFunction("window.__hspBench && window.__hspBench.ready", undefined, {
    timeout: 60_000,
  });
  await sleep(500); // let the first frames settle
  return bench<number>(page, "initialRenderMs");
}

async function scenarios(page: Page, zoom: "fit" | "working") {
  await bench(page, `setZoom("${zoom}")`);
  await sleep(500);
  const desks = await bench<Vec2[]>(page, "deskPoints(21)");
  if (desks.length < 21) throw new Error(`only ${desks.length} desks on screen at zoom=${zoom}`);
  const centre: Vec2 = [VIEWPORT.width / 2 + 112, VIEWPORT.height / 2]; // canvas is right of the 224px panel

  const drag1 = await measure(page, () => dragFrom(page, desks[0]!, 240, 120));
  await page.mouse.click(...(await bench<Vec2>(page, "emptyPoint()"))); // clear selection

  await page.keyboard.down("Shift");
  for (const p of desks.slice(1, 21)) await page.mouse.click(p[0], p[1]);
  await page.keyboard.up("Shift");
  await sleep(200);
  const drag20 = await measure(page, () => dragFrom(page, desks[1]!, -200, 160));
  await page.mouse.click(...(await bench<Vec2>(page, "emptyPoint()")));

  const pan = await measure(page, () => dragFrom(page, centre, 400, 250, 90, "middle"));
  const zoomStats = await measure(page, async () => {
    await page.mouse.move(centre[0], centre[1]);
    for (let i = 0; i < 40; i++) {
      await page.mouse.wheel(0, i < 20 ? -120 : 120);
      await sleep(STEP_MS);
    }
  });
  return { drag1, drag20, pan, zoom: zoomStats };
}

async function selectLatencies(page: Page): Promise<number[]> {
  await bench(page, 'setZoom("fit")');
  await sleep(300);
  await page.evaluate("window.__hspBench.selectLatenciesMs.length = 0");
  const desks = await bench<Vec2[]>(page, "deskPoints(12)");
  for (const p of desks.slice(0, 12)) {
    await page.mouse.click(p[0], p[1]);
    await sleep(300);
  }
  return bench<number[]>(page, "selectLatenciesMs");
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s[Math.floor(s.length / 2)] as number) : NaN;
};

async function main() {
  console.log(`> building (mode=bench)...`);
  await build({ root, mode: "bench", logLevel: "warn" });
  const server = await preview({
    root,
    mode: "bench",
    preview: { port: PORT, strictPort: true },
    logLevel: "warn",
  });

  const browser = await chromium.launch({
    channel: "chrome",
    headless: false,
    args: [`--window-size=${VIEWPORT.width},${VIEWPORT.height + 120}`],
  });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const chromeVersion = browser.version();

    console.log(`> initial render (3 loads, seats=${seats})...`);
    const initial: number[] = [];
    for (let i = 0; i < 3; i++) initial.push(await loadBench(page));
    const stats = await bench<Record<string, number>>(page, "stats");
    const svgNodes = await bench<number>(page, "svgElementCount()");

    console.log(`> interaction scenarios...`);
    const fit = await scenarios(page, "fit");
    await loadBench(page);
    const working = await scenarios(page, "working");
    await loadBench(page);
    const select = await selectLatencies(page);

    // Pass criteria from docs/0052.
    const checks: Check[] = [];
    const fps = (name: string, s: FrameStats, min: number) =>
      checks.push({
        name,
        value: s.avgFps,
        unit: "fps",
        limit: `≥ ${min}`,
        pass: s.avgFps >= min,
        detail: `p95 ${s.p95FrameMs} ms, worst ${s.worstFrameMs} ms, ${s.frames} frames`,
      });
    for (const [label, r] of [
      ["overview (fit)", fit],
      ["working zoom (15 mm/px)", working],
    ] as const) {
      fps(`Drag 1 object, ${label}`, r.drag1, LIMITS.dragFps);
      fps(`Drag 20 objects, ${label}`, r.drag20, LIMITS.dragFps);
      fps(`Pan, ${label}`, r.pan, LIMITS.panZoomFps);
      fps(`Wheel zoom, ${label}`, r.zoom, LIMITS.panZoomFps);
    }
    checks.push({
      name: "Initial render (median of 3)",
      value: median(initial),
      unit: "ms",
      limit: `≤ ${LIMITS.initialRenderMs}`,
      pass: median(initial) <= LIMITS.initialRenderMs,
      detail: `runs: ${initial.join(", ")} ms`,
    });
    checks.push({
      name: "Click → selection painted (median)",
      value: median(select),
      unit: "ms",
      limit: `≤ ${LIMITS.selectMs}`,
      pass: median(select) <= LIMITS.selectMs,
      detail: `max ${Math.max(...select)} ms over ${select.length} clicks`,
    });

    const env = {
      date: new Date().toISOString(),
      host: os.hostname(),
      cpu: os.cpus()[0]?.model.trim() ?? "unknown",
      cores: os.cpus().length,
      memoryGb: Math.round(os.totalmem() / 1e9),
      power: powerSource(),
      browser: `Google Chrome ${chromeVersion}`,
      viewport: `${VIEWPORT.width}x${VIEWPORT.height} @1x`,
      seats,
      floor: stats,
      svgNodes,
    };
    const allPass = checks.every((c) => c.pass);

    const md = [
      `# SVG performance gate: ${allPass ? "PASS" : "FAIL"}`,
      "",
      `- **When:** ${env.date}`,
      `- **Machine:** ${env.cpu} (${env.cores} threads), ${env.memoryGb} GB RAM, power: ${env.power}`,
      `- **Browser:** ${env.browser}, viewport ${env.viewport}`,
      `- **Floor:** ${seats} seats · ${stats.objects} objects · ${stats.walls} walls · ${stats.openings} doors · ${stats.zones} zones · **${svgNodes} SVG nodes**`,
      "",
      "| Check | Result | Limit | Pass | Detail |",
      "|---|---|---|---|---|",
      ...checks.map(
        (c) =>
          `| ${c.name} | ${c.value} ${c.unit} | ${c.limit} | ${c.pass ? "✅" : "❌"} | ${c.detail ?? ""} |`,
      ),
      "",
    ].join("\n");

    const outDir = path.join(here, "results");
    mkdirSync(outDir, { recursive: true });
    const stem = `${env.date.slice(0, 10)}-svg-${seats}seats-${env.host.toLowerCase()}`;
    writeFileSync(
      path.join(outDir, `${stem}.json`),
      JSON.stringify({ env, checks, raw: { fit, working, initial, select } }, null, 2) + "\n",
    );
    writeFileSync(path.join(outDir, `${stem}.md`), md);
    console.log("\n" + md);
    console.log(`> wrote bench/results/${stem}.{json,md}`);
    process.exitCode = allPass ? 0 : 1;
  } finally {
    await browser.close();
    await server.close();
  }
}

await main();
