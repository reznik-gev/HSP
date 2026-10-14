// @vitest-environment jsdom
import i18n from "i18next";
import { beforeAll, describe, expect, it } from "vitest";

import { resources } from "@/i18n";

import { problemText } from "./problems";

describe("import problems in the reader's language", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("he");
    return () => i18n.changeLanguage("en");
  });
  it("translates the code and fills in the values", () => {
    const text = problemText(i18n.t, {
      row: 4,
      column: "holder_unit_external_id",
      code: "holder_not_found",
      message: "No unit with external id OPS.",
      params: { value: "OPS" },
    });
    expect(text).toBe("קוד הצוות OPS לא קיים.");
  });

  it("picks the variant for the case at hand", () => {
    const seat = { row: 2, column: "seat_label", code: "seat_not_found", message: "" };
    expect(problemText(i18n.t, { ...seat, params: { value: "3-B-12" } })).toBe(
      "אין עמדה מפורסמת 3-B-12.",
    );
    expect(problemText(i18n.t, { ...seat, params: { value: "3-B-12", building: "HT" } })).toBe(
      "אין עמדה מפורסמת 3-B-12 בבניין HT.",
    );
  });

  it("every problem has a Hebrew wording", () => {
    expect(Object.keys(resources.he.translation.imports.problems)).toEqual(
      Object.keys(resources.en.translation.imports.problems),
    );
  });
});
