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

// Notices live in a global store (Sonner): clear them so one test's notice can't leak into the next.
afterEach(() => {
  toast.dismiss();
});
