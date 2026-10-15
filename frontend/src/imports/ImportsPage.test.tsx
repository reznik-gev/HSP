// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { page } from "@/test/stubs";
import { ADMIN, renderApp, type Reply } from "@/test/renderApp";

import { templateCsv } from "./templates";

const report = (over: object) => ({
  kind: "people",
  applied: false,
  rows: 3,
  created: 2,
  updated: 0,
  unchanged: 1,
  reactivated: 0,
  positions_created: 1,
  errors: [],
  warnings: [],
  ...over,
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await act(() => i18n.changeLanguage("en"));
});

const csv = () => new File(["email,display_name\n"], "people.csv", { type: "text/csv" });

describe("imports (docs/0088)", () => {
  it("previews the file, then applies the same file", async () => {
    const applies: (string | null)[] = [];
    await renderApp("/imports", {
      "POST /api/v1/imports/people": (r: Request): Reply => {
        const apply = new URL(r.url).searchParams.get("apply");
        applies.push(apply);
        return { status: 200, body: report({ applied: apply === "true" }) };
      },
    });
    const input = await screen.findByLabelText(/Choose a CSV or Excel file/);
    await userEvent.upload(input, csv());
    expect(await screen.findByText("Preview: nothing has changed yet")).toBeInTheDocument();
    expect(screen.getByText("Will be created").nextSibling).toHaveTextContent("2");
    expect(screen.getByText("Positions to create")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Apply import" }));
    expect(await screen.findByRole("heading", { name: "Imported" })).toBeInTheDocument();
    expect(applies).toEqual(["false", "true"]);
    expect(await screen.findByText("people.csv imported")).toBeInTheDocument();
  });

  it("lists every problem by row and column, and offers no Apply", async () => {
    await renderApp("/imports?kind=units", {
      "POST /api/v1/imports/units": {
        status: 200,
        body: report({
          kind: "units",
          errors: [
            { row: 3, column: "name", code: "required", message: "name is required." },
            {
              row: 5,
              column: "parent_external_id",
              code: "parent_not_found",
              message: "Unknown parent unit 'X'.",
              params: { value: "X" },
            },
            // A code this build doesn't know shows the server's English message.
            { row: 6, column: null, code: "something_new", message: "Something new." },
          ],
          warnings: [
            {
              code: "unknown_columns",
              message: "Ignored unknown column(s): shoe_size.",
              params: { columns: "shoe_size" },
            },
          ],
        }),
      },
    });
    await userEvent.click(await screen.findByRole("tab", { name: "Teams" }));
    await userEvent.upload(screen.getByLabelText(/Choose a CSV or Excel file/), csv());
    expect(await screen.findByRole("heading", { name: "3 problems to fix" })).toBeInTheDocument();
    expect(
      screen.getByRole("row", { name: /5 parent_external_id Unknown parent team code X\./ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /3 name This column needs a value\./ })).toBeVisible();
    expect(screen.getByRole("row", { name: /6 – Something new\./ })).toBeVisible();
    expect(screen.getByText("Ignored unknown column(s): shoe_size.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply import" })).toBeNull();
  });

  it("an unreadable file says why", async () => {
    await renderApp("/imports", {
      "POST /api/v1/imports/people": {
        status: 415,
        body: {
          type: "/problems/import-format",
          title: "Unsupported file",
          detail: "Upload a .csv or .xlsx file.",
        },
      },
    });
    await userEvent.upload(await screen.findByLabelText(/Choose a CSV or Excel file/), csv());
    expect(await screen.findByRole("alert")).toHaveTextContent("Upload a .csv or .xlsx file.");
  });

  it("is hidden from viewers", async () => {
    await renderApp("/floors", {
      "GET /api/v1/auth/me": { status: 200, body: { ...ADMIN, is_admin: false } },
      "GET /api/v1/sites": { status: 200, body: page([]) },
    });
    const nav = await screen.findByRole("navigation", { name: "Main" });
    await waitFor(() => expect(nav).toHaveTextContent("Teams"));
    expect(nav).not.toHaveTextContent("Imports");
  });

  it("templates are UTF-8 CSV with the expected columns", () => {
    const text = templateCsv("seats");
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text.slice(1).split("\r\n")[0]).toBe(
      "seat_label,building_code,holder_email,holder_unit_external_id,note",
    );
  });
});
