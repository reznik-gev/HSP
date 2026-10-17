/**
 * Pointer input on the plan in screen tests: click and drag at plan coordinates (mm, +y north)
 * on the 800 × 600 canvas the jsdom setup gives every plan (src/test/setup.ts).
 */
import { fireEvent } from "@testing-library/react";

/** Where a plan point is on the canvas, read from the SVG's viewBox. */
function onScreen(x: number, y: number): { clientX: number; clientY: number } {
  const svg = document.querySelector("svg[data-lod]")!;
  const [vx, vy, vw, vh] = svg.getAttribute("viewBox")!.split(" ").map(Number) as [
    number,
    number,
    number,
    number,
  ];
  // The plan's +Y is north, drawn upwards: SVG y is -y (docs/0042).
  return { clientX: ((x - vx) / vw) * 800, clientY: ((-y - vy) / vh) * 600 };
}

export function clickOnPlan(at: [number, number]) {
  const svg = document.querySelector("svg[data-lod]")!;
  const p = onScreen(...at);
  fireEvent.pointerDown(svg, { ...p, button: 0, pointerId: 1 });
  fireEvent.pointerUp(svg, { ...p, button: 0, pointerId: 1 });
}

export function dragOnPlan(from: [number, number], to: [number, number]) {
  const svg = document.querySelector("svg[data-lod]")!;
  const a = onScreen(...from);
  const b = onScreen(...to);
  fireEvent.pointerDown(svg, { ...a, button: 0, pointerId: 1 });
  fireEvent.pointerMove(svg, { ...b, button: 0, buttons: 1, pointerId: 1 });
  fireEvent.pointerUp(svg, { ...b, button: 0, pointerId: 1 });
}
