// Adds DOM matchers such as toBeInTheDocument() to expect() (Testing Library, docs/0087).
import "@testing-library/jest-dom/vitest";

import { configure } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach } from "vitest";

// Screen tests render the whole app (router, lazy pages, i18n). With every test file running
// in parallel, the first render can take over a second, so wait up to 5 s for elements.
configure({ asyncUtilTimeout: 5000 });

// jsdom has no pointer capture; Radix and Sonner call it on pointer events.
if (typeof Element !== "undefined" && !("setPointerCapture" in Element.prototype)) {
  Object.assign(Element.prototype, {
    setPointerCapture() {},
    releasePointerCapture() {},
    hasPointerCapture: () => false,
  });
}

// jsdom has no layout, media queries or pointer events. Screen tests get:
// - matchMedia that matches nothing (the light theme, wide screens);
// - a ResizeObserver that reports an 800 × 600 box, so plan canvases have a size;
// - PointerEvent as a MouseEvent with a pointer id, so canvases receive coordinates.
// Assigned directly rather than stubbed, so tests' vi.unstubAllGlobals() keeps them.
if (typeof window !== "undefined") {
  const missing = globalThis as {
    matchMedia?: (query: string) => unknown;
    ResizeObserver?: unknown;
    PointerEvent?: unknown;
  };
  missing.matchMedia ??= (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  missing.ResizeObserver ??= class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe() {
      const entry = { contentRect: { width: 800, height: 600 } } as ResizeObserverEntry;
      this.callback([entry], this);
    }
    unobserve() {}
    disconnect() {}
  };
  missing.PointerEvent ??= class extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  };
}

// Notices live in a global store (Sonner): clear them so one test's notice can't leak into the next.
afterEach(() => {
  toast.dismiss();
});
