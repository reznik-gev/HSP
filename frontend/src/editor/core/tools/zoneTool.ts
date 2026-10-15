/**
 * The zone tool (docs/0020, docs/0029): click the corners of an area, then click the first
 * corner again (or press Enter) to close it. Corners snap like wall corners, so rooms can
 * follow the walls. An outline that crosses itself isn't closed (`polygon_invalid`,
 * docs/0081). The new zone gets the chosen zone type and a name like "Meeting room 3"; both
 * change in the Properties panel. Escape drops the outline being drawn.
 */
import { addZone } from "../edits";
import { isSimplePolygon } from "../geometry";
import type { Vec2 } from "../plan";
import { snapPoint, snapSettings } from "../snap";
import type { EditorStore } from "../store";

const same = (p: Vec2, q: Vec2) => p[0] === q[0] && p[1] === q[1];

export class ZoneTool {
  constructor(private readonly store: EditorStore) {}

  private points(): readonly Vec2[] {
    const preview = this.store.getState().preview;
    return preview?.kind === "zone" ? preview.points : [];
  }

  private snap(p: Vec2) {
    const s = this.store.getState();
    return snapPoint(s.plan!, p, {
      ...snapSettings(s, s.snapFree),
      extra: this.points(),
    });
  }

  hover(p: Vec2): void {
    if (!this.store.getState().plan) return;
    const { point, kind } = this.snap(p);
    this.store
      .getState()
      .setPreview({ kind: "zone", points: this.points(), to: point, snap: kind });
  }

  click(p: Vec2): void {
    if (!this.store.getState().plan) return;
    const points = this.points();
    const { point, kind } = this.snap(p);
    const first = points[0];
    if (first && same(point, first)) {
      this.close();
      return;
    }
    if (points.some((q) => same(q, point))) return;
    this.store
      .getState()
      .setPreview({ kind: "zone", points: [...points, point], to: point, snap: kind });
  }

  /** Creates the zone from the corners so far; returns whether it could. */
  close(): boolean {
    const s = this.store.getState();
    const points = this.points();
    if (!s.plan || !s.zoneTypeId || !isSimplePolygon(points)) return false;
    const typeName = s.zoneTypes.get(s.zoneTypeId)?.name ?? "";
    const count = s.plan.zones.filter((z) => z.zone_type_id === s.zoneTypeId).length;
    s.perform([addZone(`${typeName} ${count + 1}`.trim(), s.zoneTypeId, points)]);
    const last = points.at(-1)!;
    this.store.getState().setPreview({ kind: "zone", points: [], to: last, snap: null });
    return true;
  }

  /** Drops the outline being drawn; returns whether there was one. */
  cancel(): boolean {
    if (!this.points().length) return false;
    const preview = this.store.getState().preview;
    if (preview?.kind === "zone") this.store.getState().setPreview({ ...preview, points: [] });
    return true;
  }
}
