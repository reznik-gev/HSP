/** The floor plan on screen, for browser tests that click on it. */
import type { Page } from "@playwright/test";

/** Screen position of a plan point (mm, +y north), read from the plan's viewBox. */
export async function planPoint(page: Page) {
  const svg = page.locator("svg[data-lod]");
  const box = (await svg.boundingBox())!;
  const [vx, vy, vw, vh] = (await svg.getAttribute("viewBox"))!.split(" ").map(Number) as [
    number,
    number,
    number,
    number,
  ];
  return (x: number, y: number) =>
    [box.x + ((x - vx) / vw) * box.width, box.y + ((-y - vy) / vh) * box.height] as const;
}
