// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminOnly } from "@/auth/admin";
import { type Me, meQuery } from "@/auth/session";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import i18n from "@/i18n";
import { notify, Toaster } from "@/lib/notify";
import { ADMIN } from "@/test/renderApp";

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await act(() => i18n.changeLanguage("en"));
});

describe("admin building blocks (docs/0088)", () => {
  it("a notice with Undo calls it back", async () => {
    const undo = vi.fn();
    render(<Toaster />);
    act(() => void notify("Maya deactivated", { description: "2 seats freed", undo }));
    expect(await screen.findByText("Maya deactivated")).toBeInTheDocument();
    expect(screen.getByText("2 seats freed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(undo).toHaveBeenCalledOnce();
  });

  it("the side panel is a labelled dialog with a Close button", async () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent aria-describedby={undefined}>
          <SheetHeader>
            <SheetTitle>Maya Shani</SheetTitle>
          </SheetHeader>
          <SheetBody>details</SheetBody>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByRole("dialog", { name: "Maya Shani" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("admin-only features are hidden from viewers", () => {
    for (const [isAdmin, shown] of [
      [false, false],
      [true, true],
    ] as const) {
      const client = new QueryClient();
      const me: Me = { ...ADMIN, is_admin: isAdmin };
      client.setQueryData(meQuery.queryKey, me);
      render(
        <QueryClientProvider client={client}>
          <AdminOnly>
            <button type="button">Assign</button>
          </AdminOnly>
        </QueryClientProvider>,
      );
      expect(Boolean(screen.queryByRole("button", { name: "Assign" }))).toBe(shown);
      cleanup();
    }
  });
});
