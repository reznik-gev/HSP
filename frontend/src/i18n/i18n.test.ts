import { describe, expect, it } from "vitest";

import en from "./en.json";
import he from "./he.json";
import { directionOf } from "./direction";

function keys(tree: object, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === "object" && v !== null ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("translations (docs/0087)", () => {
  it("English and Hebrew have the same keys", () => {
    expect(keys(he).sort()).toEqual(keys(en).sort());
  });

  it("no translation is empty", () => {
    for (const [name, tree] of Object.entries({ en, he })) {
      const flat = keys(tree).map((k) =>
        k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], tree),
      );
      expect(
        flat.filter((v) => typeof v !== "string" || !v.trim()),
        name,
      ).toEqual([]);
    }
  });

  it("Hebrew is right-to-left", () => {
    expect(directionOf("he")).toBe("rtl");
    expect(directionOf("he-IL")).toBe("rtl");
    expect(directionOf("en")).toBe("ltr");
  });
});
