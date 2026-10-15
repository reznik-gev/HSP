/**
 * Door and window tools (docs/0029: an opening has no geometry of its own, just an offset along
 * its host wall). Hover a wall to see where the opening would go, click to place it. Offsets
 * snap to 5 cm along the wall and always keep the opening inside it (`opening_exceeds_wall`,
 * docs/0081).
 */
import { addOpening, OPENING_DEFAULTS, type OpeningType } from "../edits";
import { alongSegment, distanceToSegment } from "../geometry";
import type { Plan, Vec2, Wall } from "../plan";
import { SNAP_PX } from "../snap";
import type { EditorStore } from "../store";

const STEP_MM = 50;

/** The offset that centres an opening of `width` on `centre` (mm along the wall), or null. */
export function fitOnWall(wall: Wall, centre: number, width: number): number | null {
  const length = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
  if (length < width) return null;
  const offset = Math.round((centre - width / 2) / STEP_MM) * STEP_MM;
  return Math.max(0, Math.min(Math.floor(length - width), offset));
}

/** The wall under `p` (within its thickness plus a few pixels), nearest first. */
export function wallUnder(plan: Plan, p: Vec2, mmPerPx: number): Wall | null {
  let best: Wall | null = null;
  let bestD = Infinity;
  for (const w of plan.walls) {
    const d = distanceToSegment(p, w.a, w.b);
    if (d <= w.thickness_mm / 2 + SNAP_PX * mmPerPx && d < bestD) {
      best = w;
      bestD = d;
    }
  }
  return best;
}

export class OpeningTool {
  constructor(private readonly store: EditorStore) {}

  private place(p: Vec2, type: OpeningType) {
    const s = this.store.getState();
    const width = OPENING_DEFAULTS[type].width_mm;
    const wall = s.plan && wallUnder(s.plan, p, s.viewport.mmPerPx);
    const offset = wall && fitOnWall(wall, alongSegment(p, wall.a, wall.b).along, width);
    return { wall: offset === null ? null : wall, offset: offset ?? 0, width };
  }

  hover(p: Vec2, type: OpeningType): void {
    const { wall, offset, width } = this.place(p, type);
    this.store.getState().setPreview({
      kind: "opening",
      type,
      wall_id: wall?.id ?? null,
      offset_mm: offset,
      width_mm: width,
    });
  }

  click(p: Vec2, type: OpeningType): void {
    const { wall, offset } = this.place(p, type);
    if (wall) this.store.getState().perform([addOpening(type, wall.id, offset)]);
  }
}
