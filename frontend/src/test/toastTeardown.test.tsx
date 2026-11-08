// @vitest-environment slow-teardown
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, expect, it } from "vitest";

import { notify, Toaster } from "@/lib/notify";

afterEach(() => {
  cleanup();
});

// Guards the wait at the end of setup.ts. Without it, Sonner's removal timer fires after the
// window is gone and the run fails with "window is not defined", though this test passes.
// Vitest reports that error only while other files are still running, so it shows in a full
// `pnpm test`, not when this file runs alone.
it("a notice dismissed just before the file ends doesn't outlive the window", async () => {
  render(<Toaster />);
  act(() => void notify("Saved"));
  expect(await screen.findByText("Saved")).toBeInTheDocument();
  act(() => void toast.dismiss());
  // Sonner's own marker that the removal timer has started; the notice leaves only when it fires.
  await waitFor(() => expect(document.querySelector("[data-removed='true']")).not.toBeNull());
});
