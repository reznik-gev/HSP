/**
 * Uniform-grid spatial index over element bounding boxes. Used for geometric hit-testing
 * (docs/0052: hit-testing happens in the core, not through DOM events) and later for snapping.
 */
import type { Rect } from "./geometry";

export class SpatialIndex {
  private readonly cells = new Map<string, string[]>();
  private readonly bounds = new Map<string, Rect>();

  constructor(private readonly cellSize = 2000) {}

  insert(id: string, r: Rect): void {
    this.bounds.set(id, r);
    for (const key of this.keysFor(r)) {
      const bucket = this.cells.get(key);
      if (bucket) bucket.push(id);
      else this.cells.set(key, [id]);
    }
  }

  /** Ids whose bounding box contains the point (candidates; callers do exact tests). */
  queryPoint(x: number, y: number): string[] {
    const bucket = this.cells.get(this.key(this.cell(x), this.cell(y))) ?? [];
    return bucket.filter((id) => {
      const r = this.bounds.get(id);
      return !!r && x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY;
    });
  }

  get size(): number {
    return this.bounds.size;
  }

  private cell(v: number): number {
    return Math.floor(v / this.cellSize);
  }

  private key(cx: number, cy: number): string {
    return `${cx}:${cy}`;
  }

  private *keysFor(r: Rect): Generator<string> {
    for (let cx = this.cell(r.minX); cx <= this.cell(r.maxX); cx++) {
      for (let cy = this.cell(r.minY); cy <= this.cell(r.maxY); cy++) yield this.key(cx, cy);
    }
  }
}
