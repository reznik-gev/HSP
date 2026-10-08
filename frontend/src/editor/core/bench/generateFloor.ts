/**
 * Synthetic worst-case floor for the SVG performance gate (docs/0052, docs/0073).
 *
 * Layout: an open-plan area of desk pods (6 back-to-back desks each, with chair, two attached
 * monitors and a seat label per desk) plus a band of meeting rooms along the north wall, each
 * with a door. Deterministic: the same parameters always produce the same plan.
 */
import type { CatalogItem, Opening, Plan, PlacedObject, Vec2, Wall, Zone } from "../plan";

export interface FloorParams {
  seats: number;
}

const DESK_W = 1600;
const DESK_D = 800;
const POD_PITCH_X = 3 * DESK_W + 1800; // 3 desks wide + aisle
const POD_PITCH_Y = 5000; // two desk rows + chairs + aisle
const MARGIN = 3000;
const ROOM_DEPTH = 5000;
const OUTER_T = 300;
const PARTITION_T = 120;
const WALL_H = 2800;
const DOOR_W = 900;

const CATALOG: Record<string, CatalogItem> = {
  desk: {
    id: "desk",
    key: "desk_1600x800",
    category: "desk",
    shape: "box",
    width_mm: DESK_W,
    depth_mm: DESK_D,
    height_mm: 740,
    color: "#e7e5e4",
    is_seat: true,
  },
  chair: {
    id: "chair",
    key: "task_chair",
    category: "chair",
    shape: "cylinder",
    width_mm: 650,
    depth_mm: 650,
    height_mm: 1050,
    color: "#57534e",
    is_seat: false,
  },
  monitor: {
    id: "monitor",
    key: "monitor_27",
    category: "monitor",
    shape: "box",
    width_mm: 615,
    depth_mm: 220,
    height_mm: 460,
    color: "#1c1917",
    is_seat: false,
  },
};

export interface FloorStats {
  seats: number;
  objects: number;
  walls: number;
  openings: number;
  zones: number;
  width_mm: number;
  depth_mm: number;
}

export function generateFloor({ seats }: FloorParams): { plan: Plan; stats: FloorStats } {
  const pods = Math.max(1, Math.ceil(seats / 6));
  const cols = Math.max(1, Math.ceil(Math.sqrt((pods * POD_PITCH_Y) / POD_PITCH_X)));
  const rows = Math.ceil(pods / cols);
  const width = cols * POD_PITCH_X + 2 * MARGIN;
  const openDepth = rows * POD_PITCH_Y + 2 * MARGIN;
  const depth = openDepth + ROOM_DEPTH;

  let seq = 0;
  const id = (prefix: string) => `${prefix}${++seq}`;

  // --- Walls -------------------------------------------------------------------------------
  const walls: Wall[] = [];
  const wall = (a: Vec2, b: Vec2, t: number): Wall => {
    const w = { id: id("w"), a, b, thickness_mm: t, height_mm: WALL_H };
    walls.push(w);
    return w;
  };
  // Outer shell (closed loop -> one mitred chain).
  wall([0, 0], [width, 0], OUTER_T);
  wall([width, 0], [width, depth], OUTER_T);
  wall([width, depth], [0, depth], OUTER_T);
  wall([0, depth], [0, 0], OUTER_T);

  // Meeting-room band: partitions (T-junctions) and a south wall per room hosting a door.
  const roomXs = Array.from({ length: cols + 1 }, (_, i) => Math.round((i * width) / cols));
  const openings: Opening[] = [];
  const zones: Zone[] = [];
  roomXs.forEach((x, i) => {
    if (i > 0 && i < cols) wall([x, openDepth], [x, depth], PARTITION_T);
  });
  for (let i = 0; i < cols; i++) {
    const x0 = roomXs[i] ?? 0;
    const x1 = roomXs[i + 1] ?? width;
    const south = wall([x0, openDepth], [x1, openDepth], PARTITION_T);
    openings.push({
      id: id("d"),
      wall_id: south.id,
      type: "door",
      offset_mm: Math.round((x1 - x0 - DOOR_W) / 2),
      width_mm: DOOR_W,
      height_mm: 2100,
      sill_mm: 0,
      swing: i % 2 === 0 ? "left_in" : "right_in",
    });
    zones.push({
      id: id("z"),
      name: `Meeting ${i + 1}`,
      zone_type: "Meeting room",
      color: "#c4b5fd",
      boundary: [
        [x0 + 100, openDepth + 100],
        [x1 - 100, openDepth + 100],
        [x1 - 100, depth - 200],
        [x0 + 100, depth - 200],
      ],
    });
  }

  // --- Desk pods ---------------------------------------------------------------------------
  const objects: Record<string, PlacedObject> = {};
  const objectOrder: string[] = [];
  const place = (o: Omit<PlacedObject, "id">): string => {
    const oid = id("o");
    objects[oid] = { id: oid, ...o };
    objectOrder.push(oid);
    return oid;
  };

  let placed = 0;
  for (let p = 0; p < pods && placed < seats; p++) {
    const col = p % cols;
    const row = Math.floor(p / cols);
    const x0 = MARGIN + col * POD_PITCH_X + 900; // left edge of the pod (half aisle in)
    const yMid = MARGIN + row * POD_PITCH_Y + POD_PITCH_Y / 2; // back-to-back centre line
    const rowLetter = String.fromCharCode(65 + (row % 26));
    zones.push({
      id: id("z"),
      name: `Pod ${rowLetter}${col + 1}`,
      zone_type: "Pod",
      color: "#86efac",
      boundary: [
        [x0 - 300, yMid - 2200],
        [x0 + 3 * DESK_W + 300, yMid - 2200],
        [x0 + 3 * DESK_W + 300, yMid + 2200],
        [x0 - 300, yMid + 2200],
      ],
    });
    for (let side = 0; side < 2; side++) {
      // side 0: south row facing south (rotation 0); side 1: north row facing north (180°).
      const sign = side === 0 ? -1 : 1;
      const rotation = side === 0 ? 0 : 1800;
      for (let k = 0; k < 3 && placed < seats; k++) {
        const cx = x0 + k * DESK_W + DESK_W / 2;
        const deskY = yMid + sign * (DESK_D / 2);
        placed++;
        const deskId = place({
          catalog_item_rev_id: "desk",
          position: [cx, deskY, 0],
          rotation_ddeg: rotation,
          label: `${rowLetter}-${String(placed).padStart(4, "0")}`,
          attached_to: null,
        });
        // Two monitors near the shared back edge, attached to the desk (move with it).
        for (const dx of [-330, 330]) {
          place({
            catalog_item_rev_id: "monitor",
            position: [cx + dx, yMid + sign * 150, 740],
            rotation_ddeg: rotation,
            label: null,
            attached_to: deskId,
          });
        }
        place({
          catalog_item_rev_id: "chair",
          position: [cx, yMid + sign * (DESK_D + 450), 0],
          rotation_ddeg: rotation,
          label: null,
          attached_to: null,
        });
      }
    }
  }

  const plan: Plan = { walls, openings, zones, objects, objectOrder, catalog: CATALOG };
  return {
    plan,
    stats: {
      seats: placed,
      objects: objectOrder.length,
      walls: walls.length,
      openings: openings.length,
      zones: zones.length,
      width_mm: width,
      depth_mm: depth,
    },
  };
}
