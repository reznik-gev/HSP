/**
 * Org chart layout (docs/0088 choice 11): d3-hierarchy places the teams top-down; we draw them.
 * Pure, so it is tested without a DOM. In right-to-left languages sibling order mirrors (the
 * chart reads from the right), but parents stay above their teams.
 */
import { hierarchy, tree } from "d3-hierarchy";

import type { Unit } from "./units";

export const NODE_W = 184;
export const NODE_H = 56;
const GAP_X = 24;
const GAP_Y = 48;

export interface ChartNode {
  unit: Unit;
  x: number; // centre
  y: number; // top
}

export interface ChartLink {
  from: ChartNode;
  to: ChartNode;
}

export interface ChartLayout {
  nodes: ChartNode[];
  links: ChartLink[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export function layoutChart(
  units: readonly Unit[],
  rtl: boolean,
  collator: Intl.Collator,
): ChartLayout {
  const root = units.find((u) => !u.parent_id);
  if (!root) return { nodes: [], links: [], bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
  const children = new Map<string, Unit[]>();
  for (const u of units) {
    if (!u.parent_id) continue;
    const list = children.get(u.parent_id) ?? [];
    list.push(u);
    children.set(u.parent_id, list);
  }
  const h = hierarchy(root, (u) =>
    [...(children.get(u.id) ?? [])].sort((a, b) => collator.compare(a.name, b.name)),
  );
  tree<Unit>().nodeSize([NODE_W + GAP_X, NODE_H + GAP_Y])(h);

  const byId = new Map<string, ChartNode>();
  const nodes: ChartNode[] = [];
  h.each((n) => {
    const node = { unit: n.data, x: (rtl ? -1 : 1) * (n.x ?? 0), y: n.y ?? 0 };
    byId.set(n.data.id, node);
    nodes.push(node);
  });
  const links: ChartLink[] = [];
  h.each((n) => {
    if (n.parent) {
      const from = byId.get(n.parent.data.id);
      const to = byId.get(n.data.id);
      if (from && to) links.push({ from, to });
    }
  });
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  return {
    nodes,
    links,
    bounds: {
      minX: Math.min(...xs) - NODE_W / 2,
      maxX: Math.max(...xs) + NODE_W / 2,
      minY: Math.min(...ys),
      maxY: Math.max(...ys) + NODE_H,
    },
  };
}

/** An elbow from the bottom of the parent to the top of the child. */
export function linkPath({ from, to }: ChartLink): string {
  const midY = from.y + NODE_H + GAP_Y / 2;
  return `M${from.x},${from.y + NODE_H} V${midY} H${to.x} V${to.y}`;
}
