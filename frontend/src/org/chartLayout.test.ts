import { describe, expect, it } from "vitest";

import { layoutChart, linkPath, NODE_H } from "./chartLayout";

const unit = (id: string, name: string, parent_id: string | null) => ({
  id,
  name,
  parent_id,
  level_label: null,
  color: null,
  external_id: null,
  archived_at: null,
  source: "manual",
});
const UNITS = [
  unit("u0", "Acme", null),
  unit("ops", "Operations", "u0"),
  unit("rnd", "R&D", "u0"),
  unit("plat", "Platform", "rnd"),
];
const collator = new Intl.Collator("en");

describe("org chart layout (docs/0088)", () => {
  it("puts parents above their teams, siblings in name order", () => {
    const { nodes, links } = layoutChart(UNITS, false, collator);
    const at = Object.fromEntries(nodes.map((n) => [n.unit.id, n]));
    expect(at.u0!.y).toBeLessThan(at.rnd!.y);
    expect(at.rnd!.y).toBeLessThan(at.plat!.y);
    expect(at.ops!.y).toBe(at.rnd!.y);
    expect(at.ops!.x).toBeLessThan(at.rnd!.x); // "Operations" before "R&D"
    expect(links.map((l) => `${l.from.unit.id}>${l.to.unit.id}`).sort()).toEqual([
      "rnd>plat",
      "u0>ops",
      "u0>rnd",
    ]);
  });

  it("reads from the right in Hebrew", () => {
    const ltr = Object.fromEntries(
      layoutChart(UNITS, false, collator).nodes.map((n) => [n.unit.id, n.x]),
    );
    const rtl = Object.fromEntries(
      layoutChart(UNITS, true, collator).nodes.map((n) => [n.unit.id, n.x]),
    );
    expect(rtl.ops).toBe(-ltr.ops!);
    expect(rtl.ops!).toBeGreaterThan(rtl.rnd!);
  });

  it("draws elbows from a parent's bottom edge to a team's top edge", () => {
    const { links } = layoutChart(UNITS, false, collator);
    const link = links.find((l) => l.to.unit.id === "plat")!;
    expect(linkPath(link)).toMatch(new RegExp(`^M${link.from.x},${link.from.y + NODE_H} V`));
    expect(linkPath(link)).toMatch(new RegExp(`V${link.to.y}$`));
  });

  it("is empty without a root", () => {
    expect(layoutChart([], false, collator).nodes).toEqual([]);
  });
});
