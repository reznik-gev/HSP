import { describe, expect, it } from "vitest";

import { intersectionArea, polygonArea, triangulate } from "./geometry";
import type { Vec2 } from "./plan";

const square = (x: number, y: number, size: number): Vec2[] => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
];
/** An L: a 6×6 square missing its top-right 3×3 quarter. */
const L: Vec2[] = [
  [0, 0],
  [6, 0],
  [6, 3],
  [3, 3],
  [3, 6],
  [0, 6],
];

describe("triangulate", () => {
  it("covers a concave outline exactly, whichever way round it's drawn", () => {
    for (const outline of [L, [...L].reverse()]) {
      const triangles = triangulate(outline);
      expect(triangles).toHaveLength(4);
      const total = triangles.reduce((sum, t) => sum + polygonArea(t), 0);
      expect(total).toBeCloseTo(27);
    }
  });

  it("drops corners on a straight edge", () => {
    const withMidpoint: Vec2[] = [
      [0, 0],
      [2, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ];
    const total = triangulate(withMidpoint).reduce((sum, t) => sum + polygonArea(t), 0);
    expect(total).toBeCloseTo(16);
  });
});

describe("intersectionArea", () => {
  it("measures what two squares share", () => {
    expect(intersectionArea(square(0, 0, 4), square(3, 1, 4))).toBeCloseTo(3);
  });

  it("is zero for shapes that only touch", () => {
    expect(intersectionArea(square(0, 0, 4), square(4, 0, 4))).toBeCloseTo(0);
    expect(intersectionArea(L, square(3, 3, 3))).toBeCloseTo(0);
  });

  it("follows a concave outline into its corner", () => {
    // The 3×3 square at (2,2) meets the L in an L-shaped 9 − 4 = 5.
    expect(intersectionArea(L, square(2, 2, 3))).toBeCloseTo(5);
  });
});
