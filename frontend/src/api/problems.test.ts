import { describe, expect, it } from "vitest";

import { asProblem, fieldErrors, problemMessage, problemSlug } from "./problems";

describe("server refusals in forms (docs/0037)", () => {
  const problem = asProblem({
    type: "https://hsp.example/problems/request-invalid",
    title: "Request validation failed",
    detail: null,
    errors: [
      { code: "email_taken", message: "Already used.", pointer: "/email" },
      { code: "x", message: "Second message for email is dropped.", pointer: "/email" },
      { code: "y", message: "Bad unit.", pointer: "/body/memberships/0/unit_id" },
    ],
  });

  it("maps errors to fields by their pointer", () => {
    expect(fieldErrors(problem)).toEqual({ email: "Already used.", memberships: "Bad unit." });
  });

  it("reads the slug and the overall message", () => {
    expect(problemSlug(problem)).toBe("request-invalid");
    expect(problemMessage(problem, "fallback")).toBe("Request validation failed");
    expect(problemMessage(asProblem("not a problem"), "fallback")).toBe("fallback");
  });
});
