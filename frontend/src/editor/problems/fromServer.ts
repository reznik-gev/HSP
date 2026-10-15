/**
 * A refused changeset as entries for the Problems panel (docs/0090). The server lists each
 * broken rule with a stable code and, where it can, the element (docs/0037, docs/0081);
 * otherwise the change's first element stands in.
 */
import { type Problem, problemSlug } from "@/api/problems";
import { newId } from "@/editor/core/operations";
import type { EditorProblem, PendingChange } from "@/editor/core/store";

export function problemsFromRefusal(
  problem: Problem | null,
  change: PendingChange,
): EditorProblem[] {
  const fallback = change.ops[0]?.id ?? null;
  const errors = problem?.errors ?? [];
  if (!errors.length) {
    return [
      {
        id: newId(),
        severity: "error",
        code: problemSlug(problem) ?? "refused",
        message: problem?.detail ?? problem?.title ?? "",
        elementId: fallback,
      },
    ];
  }
  return errors.map((e) => ({
    id: newId(),
    severity: "error",
    code: e.code,
    message: e.message,
    elementId:
      e.element_id ?? (e.op_index != null ? (change.ops[e.op_index]?.id ?? null) : fallback),
  }));
}
