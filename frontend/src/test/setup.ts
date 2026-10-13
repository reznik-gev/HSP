// Adds DOM matchers such as toBeInTheDocument() to expect() (Testing Library, docs/0087).
import "@testing-library/jest-dom/vitest";

import { configure } from "@testing-library/react";

// Screen tests render the whole app (router, lazy pages, i18n). With every test file running
// in parallel, the first render can take over a second, so wait up to 5 s for elements.
configure({ asyncUtilTimeout: 5000 });
