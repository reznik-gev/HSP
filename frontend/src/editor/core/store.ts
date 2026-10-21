/**
 * Client plan store (docs/0066): a vanilla Zustand store owned by the headless editor core.
 * React views subscribe through fine-grained selectors (docs/0052).
 *
 * The viewer loads a ready-made plan (`loadPlan`). The editor loads the plan as the API shapes
 * it (`loadDocument`) and changes it only through operations (docs/0050): each `perform` is one
 * undo step, and everything applied (an action, an undo or a redo) waits in `pending` until
 * autosave has saved it, one changeset each. If the server refuses one, `rejectFirst` takes back
 * just that change (docs/0090).
 */
import { createStore } from "zustand/vanilla";

import type { ArraySpec } from "./array";
import type { PlanCatalogItem, WallDefaults } from "./edits";
import { checkPlan, type Finding } from "./checks";
import { planFromApi } from "./fromApi";
import type { HeightFilter } from "./heights";
import { parsePattern } from "./numbering";
import { buildHitIndex, type HitIndex, moveObjects, withAttachments } from "./hitTest";
import { type ApiPlan, applyOps, type Op } from "./operations";
import type { Plan, Vec2 } from "./plan";
import type { SnapKind } from "./snap";
import type { DisplayUnit } from "./units";
import type { Viewport } from "./viewport";

export interface DragState {
  /** Current drag offset in plan mm (already snapped). */
  dx: number;
  dy: number;
  /** A single item turned by a face snap (docs/0047): by how much, about which point. */
  turn?: { ddeg: number; pivot: Vec2 };
  /** A single attachable item: the host it now sits on, or null to detach it. */
  attachTo?: { id: string; host: string | null };
}

export type ZoneTypes = ReadonlyMap<string, { name: string; color: string | null }>;

/** The editing tools of phase 3a so far (docs/0089). */
export type Tool = "select" | "wall" | "door" | "window" | "column" | "zone" | "item" | "number";

/** What a tool shows while it works, before anything is committed. */
export type Preview =
  /**
   * The wall chain being drawn (docs/0044): `start` is its first point (clicking it again closes
   * the room), `from` the last placed point (null before the first click), `to` the pointer.
   */
  | { kind: "wall"; start: Vec2 | null; from: Vec2 | null; to: Vec2; snap: SnapKind }
  /** A junction being dragged: these walls' endpoints at `from` follow the pointer. */
  | { kind: "junction"; from: Vec2; to: Vec2; walls: readonly string[]; snap: SnapKind }
  /**
   * A door or window being placed (no `id`) or slid along its wall (`id`); `wall_id` is null
   * while the pointer is over no wall it fits in.
   */
  | {
      kind: "opening";
      id?: string;
      type: "door" | "window";
      wall_id: string | null;
      offset_mm: number;
      width_mm: number;
    }
  /** A zone being drawn: the corners so far, and the pointer. */
  | { kind: "zone"; points: readonly Vec2[]; to: Vec2; snap: SnapKind }
  /** A zone corner being dragged. */
  | { kind: "vertex"; zone: string; index: number; to: Vec2; snap: SnapKind }
  /** Seats being numbered by a click or a drag (docs/0049), with the labels they'll get. */
  | { kind: "numbering"; seats: readonly { id: string; label: string }[] }
  /** A catalog item about to be placed: where, turned how far, and what it snapped to. */
  | {
      kind: "item";
      at: Vec2;
      rotation_ddeg: number;
      snap?: "face" | "attach" | "grid" | null;
    }
  /** A column about to be placed: its footprint. */
  | { kind: "column"; footprint: readonly Vec2[]; snap: SnapKind }
  | null;

export interface Step {
  ops: Op[];
  inverse: Op[];
}

/** One applied change waiting for the server: a user action, an undo or a redo. */
export interface PendingChange {
  ops: Op[];
  /** Takes the change back locally. */
  inverse: Op[];
  /** The undo step it belongs to. */
  step: Step;
  origin: "do" | "undo" | "redo";
}

/** Something the editor reports in the Problems panel (docs/0090). */
export interface EditorProblem {
  id: string;
  severity: "error" | "warning";
  code: string;
  /** The server's English message, shown when the code has no translation. */
  message: string;
  elementId: string | null;
}

export interface EditorState {
  plan: Plan | null;
  hitIndex: HitIndex | null;
  selection: ReadonlySet<string>;
  drag: DragState | null;
  viewport: Viewport;
  displayUnit: DisplayUnit;
  gridMm: 10 | 50 | 100 | 500;
  gridSnap: boolean;
  /** Which items the plan shows at full strength (docs/0095); the rest is faded. */
  heightFilter: HeightFilter;
  /** Alt is held: snapping is off for this pointer move (docs/0047). */
  snapFree: boolean;
  /** Shift is held: a wall's end keeps to the nearest straight line (docs/0108). */
  snapStraight: boolean;
  /** The edited plan in API shape; null in the read-only viewer. */
  document: ApiPlan | null;
  zoneTypes: ZoneTypes;
  undoStack: readonly Step[];
  redoStack: readonly Step[];
  /** Applied changes not yet saved, oldest first. */
  pending: readonly PendingChange[];
  problems: readonly EditorProblem[];
  /** What the editor's own checks find in the plan right now (docs/0051), live. */
  findings: readonly Finding[];
  /** Seat numbering (docs/0049): the pattern, and the counter for the next seat. */
  numbering: { pattern: string; next: number };
  /** Seat labels used elsewhere in the building, which numbering skips (docs/0034). */
  takenLabels: ReadonlySet<string>;
  /** The array being set up for the selection (docs/0049), shown on the plan; null if none. */
  arrayDraft: ArraySpec | null;
  /** The typed-measurement box (docs/0045): where it opened and what was typed first. */
  measure: { sx: number; sy: number; first: string } | null;
  /** Which tab the side panel shows (docs/0090). */
  panelTab: "properties" | "problems";
  /** Counts loaded plans (`loadPlan`, `loadDocument`), so views can tell them from edits. */
  generation: number;
  tool: Tool;
  preview: Preview;
  /** Thickness and height for new walls. */
  wallDefaults: WallDefaults;
  /** The zone type new zones get (docs/0020). */
  zoneTypeId: string | null;
  /** The catalog item the item tool places, and how far it's turned (R turns it). */
  placing: PlanCatalogItem | null;
  placingRotation: number;
  loadPlan(plan: Plan): void;
  /** Opens a plan for editing; clears the history, pending changes and problems. */
  loadDocument(document: ApiPlan, zoneTypes: ZoneTypes): void;
  /** Applies one user action as a single undo step. */
  perform(ops: Op[]): void;
  undo(): void;
  redo(): void;
  /** The oldest pending change was saved. */
  confirmFirst(): void;
  /**
   * The server refused the oldest pending change: take it back, keep the later changes that
   * don't depend on it, and drop it from the undo history. Returns what was taken back.
   */
  rejectFirst(): { rejected: PendingChange; dropped: PendingChange[] } | null;
  addProblems(problems: EditorProblem[]): void;
  dismissProblem(id: string): void;
  setPanelTab(tab: "properties" | "problems"): void;
  setMeasure(measure: EditorState["measure"]): void;
  setArrayDraft(spec: ArraySpec | null): void;
  /** A new pattern starts its counter over, at the pattern's first number. */
  setNumbering(change: Partial<EditorState["numbering"]>): void;
  setTakenLabels(labels: ReadonlySet<string>): void;
  select(ids: Iterable<string>, additive?: boolean): void;
  clearSelection(): void;
  setViewport(viewport: Viewport): void;
  setDrag(drag: DragState | null): void;
  commitDrag(): void;
  setDisplayUnit(unit: DisplayUnit): void;
  toggleGridSnap(): void;
  setGridMm(gridMm: EditorState["gridMm"]): void;
  setHeightFilter(filter: HeightFilter): void;
  setSnapFree(free: boolean): void;
  setSnapStraight(straight: boolean): void;
  setTool(tool: Tool): void;
  setPreview(preview: Preview): void;
  setWallDefaults(defaults: Partial<WallDefaults>): void;
  setZoneType(id: string): void;
  setPlacing(item: PlanCatalogItem | null): void;
  rotatePlacing(): void;
  /** Adds a catalog revision to the document, so objects of it can be drawn (docs/0021). */
  ensureCatalog(item: PlanCatalogItem): void;
}

/** `p` turned about `pivot` by `ddeg` decidegrees, anticlockwise. */
function rotateAbout(p: Vec2, pivot: Vec2, ddeg: number): Vec2 {
  const r = (ddeg * Math.PI) / 1800;
  const dx = p[0] - pivot[0];
  const dy = p[1] - pivot[1];
  return [
    pivot[0] + dx * Math.cos(r) - dy * Math.sin(r),
    pivot[1] + dx * Math.sin(r) + dy * Math.cos(r),
  ];
}

/** Whether any element of the plan has this id. */
function exists(plan: Plan, id: string): boolean {
  return Boolean(
    plan.objects[id] ||
    plan.walls.some((w) => w.id === id) ||
    plan.openings.some((o) => o.id === id) ||
    plan.columns?.some((c) => c.id === id) ||
    plan.zones.some((z) => z.id === id),
  );
}

export function createEditorStore() {
  return createStore<EditorState>()((set, get) => {
    /** The editor's checks over a document (docs/0051). */
    const check = (document: ApiPlan, zoneTypes: ZoneTypes) =>
      checkPlan(document, { zoneTypeIds: new Set(zoneTypes.keys()), deviceIds: null });
    /** Shows a new version of the document and refreshes everything derived from it. */
    const show = (document: ApiPlan) => {
      const { zoneTypes, selection } = get();
      const plan = planFromApi(document, zoneTypes);
      set({
        document,
        findings: check(document, zoneTypes),
        plan,
        hitIndex: buildHitIndex(plan),
        // Whatever was deleted can't stay selected.
        selection: new Set([...selection].filter((id) => exists(plan, id))),
        drag: null,
      });
    };
    /** Applies ops as a change waiting to be saved; returns its undo step. */
    const apply = (ops: Op[], step: Step | null, origin: PendingChange["origin"]): Step => {
      const { document } = get();
      if (!document) throw new Error("no plan open for editing");
      const result = applyOps(document, ops);
      show(result.plan);
      const change: PendingChange = {
        ops,
        inverse: result.inverse,
        step: step ?? { ops, inverse: result.inverse },
        origin,
      };
      set({ pending: [...get().pending, change] });
      return change.step;
    };
    return {
      plan: null,
      hitIndex: null,
      selection: new Set(),
      drag: null,
      viewport: { cx: 0, cy: 0, mmPerPx: 20 },
      displayUnit: "cm",
      gridMm: 50, // 5 cm default (docs/0047)
      gridSnap: true,
      heightFilter: "all",
      snapFree: false,
      snapStraight: false,
      document: null,
      zoneTypes: new Map(),
      undoStack: [],
      redoStack: [],
      pending: [],
      problems: [],
      findings: [],
      panelTab: "properties",
      measure: null,
      arrayDraft: null,
      numbering: { pattern: "{01}", next: 1 },
      takenLabels: new Set(),
      generation: 0,
      tool: "select",
      preview: null,
      wallDefaults: { thickness_mm: 150, height_mm: 3000 },
      zoneTypeId: null,
      placing: null,
      placingRotation: 0,
      loadPlan: (plan) =>
        set({
          plan,
          hitIndex: buildHitIndex(plan),
          selection: new Set(),
          drag: null,
          generation: get().generation + 1,
        }),
      loadDocument: (document, zoneTypes) => {
        const plan = planFromApi(document, zoneTypes);
        set({
          document,
          zoneTypes,
          plan,
          hitIndex: buildHitIndex(plan),
          selection: new Set(),
          drag: null,
          undoStack: [],
          redoStack: [],
          pending: [],
          problems: [],
          findings: check(document, zoneTypes),
          generation: get().generation + 1,
        });
      },
      perform: (ops) => {
        if (!ops.length) return;
        const step = apply(ops, null, "do");
        set({ undoStack: [...get().undoStack, step], redoStack: [] });
      },
      undo: () => {
        const step = get().undoStack.at(-1);
        if (!step) return;
        apply(step.inverse, step, "undo");
        set({ undoStack: get().undoStack.slice(0, -1), redoStack: [...get().redoStack, step] });
      },
      redo: () => {
        const step = get().redoStack.at(-1);
        if (!step) return;
        apply(step.ops, step, "redo");
        set({ redoStack: get().redoStack.slice(0, -1), undoStack: [...get().undoStack, step] });
      },
      confirmFirst: () => set({ pending: get().pending.slice(1) }),
      rejectFirst: () => {
        const { document, pending, undoStack, redoStack } = get();
        const [rejected, ...later] = pending;
        if (!document || !rejected) return null;
        // Take back everything unsaved, newest first, then redo the later changes that still
        // apply without the rejected one.
        let doc = document;
        for (const change of [...pending].reverse()) doc = applyOps(doc, change.inverse).plan;
        const kept: PendingChange[] = [];
        const dropped: PendingChange[] = [];
        for (const change of later) {
          try {
            const result = applyOps(doc, change.ops);
            doc = result.plan;
            kept.push({ ...change, inverse: result.inverse });
          } catch {
            dropped.push(change);
          }
        }
        show(doc);
        const gone = new Set([rejected, ...dropped].map((c) => c.step));
        // A refused undo or redo leaves the history out of step with the plan: start it over.
        const clean = rejected.origin === "do" && dropped.every((c) => c.origin === "do");
        set({
          pending: kept,
          undoStack: clean ? undoStack.filter((st) => !gone.has(st)) : [],
          redoStack: clean ? redoStack.filter((st) => !gone.has(st)) : [],
        });
        return { rejected, dropped };
      },
      addProblems: (problems) => set({ problems: [...get().problems, ...problems] }),
      dismissProblem: (id) => set({ problems: get().problems.filter((p) => p.id !== id) }),
      setPanelTab: (panelTab) => set({ panelTab }),
      setMeasure: (measure) => set({ measure }),
      setArrayDraft: (arrayDraft) => set({ arrayDraft }),
      setNumbering: (change) => {
        const pattern = change.pattern ?? get().numbering.pattern;
        const next =
          change.next ??
          (change.pattern !== undefined
            ? (parsePattern(pattern)?.start ?? 1)
            : get().numbering.next);
        set({ numbering: { pattern, next } });
      },
      setTakenLabels: (takenLabels) => set({ takenLabels }),
      select: (ids, additive = false) => {
        const { plan, selection } = get();
        if (!plan) return;
        const base = additive ? [...selection, ...ids] : [...ids];
        set({ selection: withAttachments(plan, base), arrayDraft: null });
      },
      clearSelection: () => set({ selection: new Set(), arrayDraft: null }),
      setViewport: (viewport) => set({ viewport }),
      setDrag: (drag) => set({ drag }),
      commitDrag: () => {
        const { plan, drag, selection, document } = get();
        if (!plan || !drag) return set({ drag: null });
        if (document) {
          // Editing: a move is one undoable step of position updates.
          const ops: Op[] = [];
          for (const c of plan.columns ?? []) {
            if (!selection.has(c.id) || (drag.dx === 0 && drag.dy === 0)) continue;
            const footprint = c.footprint.map((p) => [p[0] + drag.dx, p[1] + drag.dy]);
            ops.push({ op: "update", kind: "column", id: c.id, data: { footprint } });
          }
          const turn = drag.turn?.ddeg ?? 0;
          for (const id of selection) {
            const o = plan.objects[id];
            const attach = drag.attachTo?.id === id ? drag.attachTo.host : undefined;
            if (!o || (drag.dx === 0 && drag.dy === 0 && !turn && attach === undefined)) continue;
            // Turned about the pivot, then moved; whole millimetres only (docs/0029).
            const [x, y] = drag.turn
              ? rotateAbout([o.position[0], o.position[1]], drag.turn.pivot, turn)
              : [o.position[0], o.position[1]];
            const data: Record<string, unknown> = {
              position: [Math.round(x + drag.dx), Math.round(y + drag.dy), o.position[2]],
            };
            if (turn) data.rotation_ddeg = (((o.rotation_ddeg + turn) % 3600) + 3600) % 3600;
            if (attach !== undefined && attach !== o.attached_to) data.attached_to = attach;
            ops.push({ op: "update", kind: "object", id, data });
          }
          if (ops.length) get().perform(ops);
          return set({ drag: null });
        }
        const moved = moveObjects(plan, selection, drag.dx, drag.dy);
        set({ plan: moved, hitIndex: buildHitIndex(moved), drag: null });
      },
      setDisplayUnit: (displayUnit) => set({ displayUnit }),
      toggleGridSnap: () => set((s) => ({ gridSnap: !s.gridSnap })),
      setGridMm: (gridMm) => set({ gridMm }),
      setHeightFilter: (heightFilter) => set({ heightFilter }),
      setSnapFree: (snapFree) => {
        if (get().snapFree !== snapFree) set({ snapFree });
      },
      setSnapStraight: (snapStraight) => {
        if (get().snapStraight !== snapStraight) set({ snapStraight });
      },
      setTool: (tool) => set({ tool, preview: null }),
      setPreview: (preview) => set({ preview }),
      setWallDefaults: (defaults) => set({ wallDefaults: { ...get().wallDefaults, ...defaults } }),
      setZoneType: (zoneTypeId) => set({ zoneTypeId }),
      setPlacing: (placing) => set({ placing, placingRotation: 0 }),
      rotatePlacing: () => set({ placingRotation: (get().placingRotation + 900) % 3600 }),
      ensureCatalog: (item) => {
        const { document } = get();
        if (!document || document.catalog[item.id]) return;
        set({ document: { ...document, catalog: { ...document.catalog, [item.id]: item } } });
      },
    };
  });
}

export type EditorStore = ReturnType<typeof createEditorStore>;
