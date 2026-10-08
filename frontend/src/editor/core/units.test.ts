import { describe, expect, it } from "vitest";

import { formatAngle, formatLength, parseLength } from "./units";

describe("parseLength", () => {
  it.each([
    ["350", "cm", 3500],
    ["350cm", "m", 3500],
    ["3.5m", "cm", 3500],
    ["3,5 m", "cm", 3500],
    ["3500mm", "cm", 3500],
    ["0.04", "cm", 0], // 0.4 mm rounds to 0
    ["12.345", "m", 12345],
  ] as const)("%s (display %s) -> %d mm", (input, unit, expected) => {
    expect(parseLength(input, unit)).toBe(expected);
  });

  it.each(["", "abc", "3m5", "10 ft"])("rejects %j", (input) => {
    expect(parseLength(input, "cm")).toBeNull();
  });

  it("always returns whole millimetres (docs/0029)", () => {
    expect(Number.isInteger(parseLength("1.23456m", "cm"))).toBe(true);
  });
});

describe("formatLength", () => {
  it("formats per display unit", () => {
    expect(formatLength(3500, "cm")).toBe("350 cm");
    expect(formatLength(3505, "cm")).toBe("350.5 cm");
    expect(formatLength(3500, "m")).toBe("3.50 m");
    expect(formatLength(3500, "mm")).toBe("3500 mm");
  });
});

describe("formatAngle", () => {
  it("formats decidegrees", () => {
    expect(formatAngle(900)).toBe("90°");
    expect(formatAngle(455)).toBe("45.5°");
  });
});
