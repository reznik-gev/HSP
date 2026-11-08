// `// @vitest-environment slow-teardown` (aliased in vite.config.ts): jsdom, but the worker
// stays alive for half a second after the window is gone, as a busy CI worker can. A timer that
// outlives its test file then fires without a window, so toastTeardown.test.tsx can show it.
import { builtinEnvironments, type Environment } from "vitest/runtime";

const jsdom = builtinEnvironments.jsdom;

export default {
  ...jsdom,
  name: "slow-teardown",
  async setup(global, options) {
    const env = await jsdom.setup(global, options);
    return {
      async teardown(global) {
        await env.teardown(global);
        await new Promise((resolve) => setTimeout(resolve, 500));
      },
    };
  },
} satisfies Environment;
