/**
 * Import problems in the reader's language. The server sends a code plus the values to show
 * (`params`) next to an English message; we translate the code and fall back to the message
 * for codes this build doesn't know yet.
 */
import type { TFunction } from "i18next";

import type { components } from "@/api/schema";

type Problem = components["schemas"]["RowError"] | components["schemas"]["ImportWarning"];

/** Picks the wording variant (i18next context) where one code covers several cases. */
function context(problem: Problem): string | undefined {
  const params = problem.params ?? {};
  const column = "column" in problem ? problem.column : undefined;
  switch (problem.code) {
    case "seat_not_found":
      return params.building ? "building" : undefined;
    case "identity_conflict":
      return params.current ? "current" : undefined;
    case "holder_not_found":
    case "holder_inactive":
      return column === "holder_email" ? "person" : "team";
  }
  return undefined;
}

export function problemText(t: TFunction, problem: Problem): string {
  return t(`imports.problems.${problem.code}`, {
    ...problem.params,
    context: context(problem),
    defaultValue: problem.message,
  });
}
