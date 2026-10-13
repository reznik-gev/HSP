// Adds DOM matchers such as toBeInTheDocument() to expect() (Testing Library, docs/0087).
import "@testing-library/jest-dom/vitest";

import { configure } from "@testing-library/react";

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
