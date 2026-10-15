/**
 * The shared validation cases (/shared/validation-cases, docs/0051), run against the editor's
 * checker. The server runs the same files (backend/tests/unit/test_shared_validation_cases.py).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { checkPlan } from "./checks";
import type { ApiPlan } from "./operations";

const DIR = fileURLToPath(new URL("../../../../shared/validation-cases", import.meta.url));

interface Group {
  rule: string;
  catalog?: ApiPlan["catalog"];
  zone_types?: string[];
  devices?: string[];
  cases: {
    name: string;
    plan: Partial<ApiPlan>;
    expect: { code: string; element_id: string; severity?: string }[];
  }[];
}

const groups = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => [f, JSON.parse(readFileSync(join(DIR, f), "utf-8")) as Group] as const);

describe("shared validation cases", () => {
  it("there are some", () => {
    expect(groups.length).toBeGreaterThan(0);
  });

  for (const [file, group] of groups) {
    describe(`${file}: ${group.rule}`, () => {
      for (const c of group.cases) {
        it(c.name, () => {
          const plan = {
            walls: [],
            openings: [],
            columns: [],
            zones: [],
            objects: [],
            ...c.plan,
            catalog: { ...group.catalog, ...c.plan.catalog },
          } as unknown as ApiPlan;
          const found = checkPlan(plan, {
            zoneTypeIds: new Set(group.zone_types ?? []),
            deviceIds: new Set(group.devices ?? []),
          }).map((f) => [f.code, f.elementId, f.severity]);
          const expected = c.expect.map((e) => [e.code, e.element_id, e.severity ?? "error"]);
          expect(found.sort()).toEqual(expected.sort());
        });
      }
    });
  }
});
