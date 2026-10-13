/**
 * Server refusals (RFC 9457 Problem Details, docs/0037) turned into what a form shows: one
 * message per field (from each error's JSON pointer, e.g. "/email") and an overall message.
 */
/** Mirrors backend/src/hsp/problems.py (error bodies aren't in the OpenAPI schema). */
interface ProblemError {
  code: string;
  message: string;
  pointer?: string | null;
  op_index?: number | null;
  element_id?: string | null;
}

export interface Problem {
  status?: number;
  type?: string;
  title?: string;
  detail?: string | null;
  errors?: ProblemError[] | null;
}

/** An API refusal as a throwable error, for mutations (keeps the Problem Details). */
export class ApiProblem extends Error {
  constructor(readonly problem: Problem | null) {
    super(problem?.title ?? "Request failed");
  }
}

export function asProblem(error: unknown): Problem | null {
  if (error instanceof ApiProblem) return error.problem;
  return error && typeof error === "object" && ("title" in error || "type" in error)
    ? (error as Problem)
    : null;
}

/** The slug at the end of the problem type URL, e.g. "email-taken". */
export function problemSlug(problem: Problem | null): string | null {
  return problem?.type?.split("/").pop() ?? null;
}

/** Field name -> message, from errors pointing at a top-level body field. */
export function fieldErrors(problem: Problem | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of problem?.errors ?? []) {
    const field = e.pointer?.replace(/^\/(body\/)?/, "").split("/")[0];
    if (field && !out[field]) out[field] = e.message;
  }
  return out;
}

/** The sentence to show for the whole form. */
export function problemMessage(problem: Problem | null, fallback: string): string {
  return problem?.detail ?? problem?.title ?? fallback;
}
