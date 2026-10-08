/**
 * /bench/svg: the SVG performance playground (docs/0052, docs/0073). Dev-only: included only in
 * the dev server and in `vite build --mode bench`, never in production builds.
 *
 * Play with it: pan (drag empty space or middle-drag), zoom (wheel), click a desk to select it
 * (its monitors come along), shift-click to add, drag to move. The overlay shows live FPS.
 * The Playwright runner (`pnpm bench:svg`) drives the same page through `window.__hspBench`.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { generateFloor, type FloorStats } from "@/editor/core/bench/generateFloor";
import { Interaction } from "@/editor/core/interaction";
import type { Vec2 } from "@/editor/core/plan";
import { createEditorStore } from "@/editor/core/store";
import { fitRect, planToScreen } from "@/editor/core/viewport";
import { PlanView, type RenderOptions } from "@/editor/view-svg/PlanView";

import { FrameMeter, type FrameStats } from "./frameMeter";

const SEAT_OPTIONS = [100, 500, 1000, 1500, 2000, 3000];
const WORKING_MM_PER_PX = 15;

interface BenchApi {
  ready: boolean;
  stats: FloorStats | null;
  initialRenderMs: number | null;
  selectLatenciesMs: number[];
  svgElementCount(): number;
  startRecording(): void;
  stopRecording(): FrameStats;
  setZoom(mode: "fit" | "working"): void;
  /** Screen points (page coordinates) of up to `n` desk centres currently on screen. */
  deskPoints(n: number): Vec2[];
  /** A page point over empty floor (no object), for panning. */
  emptyPoint(): Vec2;
}

declare global {
  interface Window {
    __hspBench?: BenchApi;
  }
}

function readParams() {
  const q = new URLSearchParams(window.location.search);
  const flag = (name: string, dflt: boolean) => (q.has(name) ? q.get(name) !== "0" : dflt);
  return {
    seats: Number(q.get("seats") ?? 1500),
    options: {
      labels: flag("labels", true),
      hatching: flag("hatching", true),
      doorArcs: flag("arcs", true),
      zoneFills: flag("zones", true),
      lod: flag("lod", false),
    } satisfies RenderOptions,
  };
}

export function SvgBench() {
  const [initial] = useState(readParams);
  const [seats, setSeats] = useState(initial.seats);
  const [options, setOptions] = useState<RenderOptions>(initial.options);
  const [store] = useState(createEditorStore);
  const [interaction] = useState(() => new Interaction(store));
  const [meter] = useState(() => new FrameMeter());
  const [live, setLive] = useState<FrameStats | null>(null);
  const [initialRenderMs, setInitialRenderMs] = useState<number | null>(null);
  const [lastSelectMs, setLastSelectMs] = useState<number | null>(null);
  const [elements, setElements] = useState(0);
  const canvasRef = useRef<HTMLDivElement>(null);
  const renderStart = useRef<number | null>(null);
  const api = useRef<BenchApi | null>(null);

  const fit = () => {
    const plan = store.getState().plan;
    const el = canvasRef.current;
    if (!plan || !el) return;
    const r = el.getBoundingClientRect();
    store
      .getState()
      .setViewport(
        fitRect({ minX: 0, minY: 0, maxX: stats.width_mm, maxY: stats.depth_mm }, [
          r.width,
          r.height,
        ]),
      );
  };

  // Generate (pure, derived from `seats`), then load into the external store.
  const floor = useMemo(() => generateFloor({ seats }), [seats]);
  const stats = floor.stats;
  useEffect(() => {
    const r = canvasRef.current?.getBoundingClientRect();
    renderStart.current = performance.now();
    store.getState().loadPlan(floor.plan);
    if (r) {
      const s = floor.stats;
      store
        .getState()
        .setViewport(
          fitRect({ minX: 0, minY: 0, maxX: s.width_mm, maxY: s.depth_mm }, [r.width, r.height]),
        );
    }
  }, [floor, store]);

  // Live overlay refresh.
  useEffect(() => {
    meter.start();
    const t = setInterval(() => {
      setLive(meter.live());
      setElements(canvasRef.current?.querySelectorAll("svg *").length ?? 0);
    }, 250);
    return () => {
      clearInterval(t);
      meter.stop();
    };
  }, [meter]);

  // Automation API for the Playwright runner.
  useEffect(() => {
    const bench: BenchApi = {
      ready: false,
      stats: null,
      initialRenderMs: null,
      selectLatenciesMs: [],
      svgElementCount: () => canvasRef.current?.querySelectorAll("svg *").length ?? 0,
      startRecording: () => meter.startRecording(),
      stopRecording: () => meter.stopRecording(),
      setZoom: (mode) => {
        const s = store.getState();
        const el = canvasRef.current;
        if (!el || !bench.stats) return;
        const r = el.getBoundingClientRect();
        const full = fitRect(
          { minX: 0, minY: 0, maxX: bench.stats.width_mm, maxY: bench.stats.depth_mm },
          [r.width, r.height],
        );
        s.setViewport(mode === "fit" ? full : { ...full, mmPerPx: WORKING_MM_PER_PX });
      },
      deskPoints: (n) => {
        const s = store.getState();
        const el = canvasRef.current;
        if (!s.plan || !el) return [];
        const r = el.getBoundingClientRect();
        const size: Vec2 = [r.width, r.height];
        const desks = s.plan.objectOrder
          .map((id) => s.plan?.objects[id])
          .filter((o) => o && s.plan?.catalog[o.catalog_item_rev_id]?.is_seat)
          .map((o) => planToScreen(s.viewport, size, [o!.position[0], o!.position[1]]))
          .filter(([x, y]) => x > 40 && y > 40 && x < r.width - 40 && y < r.height - 40);
        const step = Math.max(1, Math.floor(desks.length / Math.max(1, n)));
        return desks
          .filter((_, i) => i % step === 0)
          .slice(0, n)
          .map(([x, y]) => [x + r.left, y + r.top] as const);
      },
      emptyPoint: () => {
        const el = canvasRef.current;
        const r = el?.getBoundingClientRect();
        const s = store.getState();
        if (!r || !bench.stats) return [0, 0];
        // Just inside the south-west corner of the floor: the margin aisle has no objects.
        const size: Vec2 = [r.width, r.height];
        const [x, y] = planToScreen(s.viewport, size, [1500, 1500]);
        const cx = Math.min(Math.max(x, 20), r.width - 20);
        const cy = Math.min(Math.max(y, 20), r.height - 20);
        return [cx + r.left, cy + r.top];
      },
    };
    api.current = bench;
    window.__hspBench = bench;
    return () => {
      delete window.__hspBench;
    };
  }, [meter, store]);

  useEffect(() => {
    if (api.current) {
      api.current.stats = stats;
      api.current.initialRenderMs = initialRenderMs;
      api.current.ready = stats !== null && initialRenderMs !== null;
    }
  }, [stats, initialRenderMs]);

  const toggle = (key: keyof RenderOptions) => setOptions((o) => ({ ...o, [key]: !o[key] }));

  return (
    <div className="fixed inset-0 z-10 flex bg-white text-sm">
      <aside className="w-56 shrink-0 space-y-4 border-r border-border p-4">
        <div>
          <h1 className="text-base font-semibold">SVG bench</h1>
          <p className="text-muted-foreground">docs/0052 · docs/0073</p>
        </div>
        <label className="block space-y-1">
          <span>Seats</span>
          <select
            className="w-full rounded border border-border px-2 py-1"
            value={seats}
            onChange={(e) => {
              setInitialRenderMs(null);
              setSeats(Number(e.target.value));
            }}
          >
            {SEAT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="space-y-1">
          {(
            [
              ["labels", "Seat labels"],
              ["hatching", "Wall hatching"],
              ["doorArcs", "Door swing arcs"],
              ["zoneFills", "Zone fills"],
              ["lod", "Level of detail"],
            ] as const
          ).map(([key, text]) => (
            <label key={key} className="flex items-center gap-2">
              <input type="checkbox" checked={options[key]} onChange={() => toggle(key)} />
              {text}
            </label>
          ))}
        </fieldset>
        <button className="rounded border border-border px-3 py-1" onClick={fit}>
          Fit floor
        </button>
        <div className="space-y-1 text-muted-foreground">
          <p>Drag empty space or middle-drag: pan</p>
          <p>Wheel: zoom</p>
          <p>Click desk: select · Shift-click: add</p>
          <p>Drag selection: move (5 cm grid)</p>
        </div>
      </aside>
      <div ref={canvasRef} className="relative flex-1">
        <PlanView
          store={store}
          interaction={interaction}
          options={options}
          onStaticPainted={() => {
            if (renderStart.current !== null) {
              setInitialRenderMs(Math.round(performance.now() - renderStart.current));
              renderStart.current = null;
            }
          }}
          onSelectionPainted={(ms) => {
            const v = Math.round(ms * 10) / 10;
            setLastSelectMs(v);
            api.current?.selectLatenciesMs.push(v);
          }}
        />
        <div className="pointer-events-none absolute right-3 top-3 rounded bg-black/75 px-3 py-2 font-mono text-xs leading-5 text-white">
          <div>
            FPS {live?.avgFps ?? "-"} · p95 {live?.p95FrameMs ?? "-"} ms
          </div>
          <div>initial render {initialRenderMs ?? "-"} ms</div>
          <div>select→paint {lastSelectMs ?? "-"} ms</div>
          <div>
            {stats?.seats ?? 0} seats · {stats?.objects ?? 0} objects · {elements} svg nodes
          </div>
        </div>
      </div>
    </div>
  );
}
