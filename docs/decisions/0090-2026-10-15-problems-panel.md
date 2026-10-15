# 0090 — The editor's Problems panel and refused changes

- **Date:** 2026-10-15
- **Status:** Accepted
- **Refines:** [0051](0051-2026-10-08-validation-feedback.md), [0089](0089-2026-10-15-floor-editor.md)

## Context
[0089](0089-2026-10-15-floor-editor.md) planned a Problems panel next to Properties and left its details to the assistant. The product owner wasn't sure how it should look and behave, so it was decided together before it was built. In phase 3a the panel lists changes the server refuses; from phase 3b it also lists the editor's own live checks ([0051](0051-2026-10-08-validation-feedback.md)).

## Decisions
| # | Question | Options | Chosen |
|---|---|---|---|
| 1 | Where it lives | **A tab beside Properties** / a strip under the plan / a badge in the top bar | **A tab beside Properties** in the editor's side panel, with the number of problems on the tab (red with errors, amber with only warnings). The plan keeps its full height. |
| 2 | A refused change | **Undo just that change** / reload the draft | **Only the refused change is taken back.** Later changes that don't depend on it stay; those that do (e.g. moving a wall whose adding was refused) go with it. It leaves the undo history. The Problems tab opens with the reason, the element is selected and shown, and a notice says what happened. |
| 3 | Clicking a problem | **Select it and zoom to it** / select only | **The element is selected and brought into view** with its neighbours around it, never zoomed in closer than about 8 mm per pixel. |

## Consequences
- **One changeset per change.** Autosave still waits about a second after the last change ([0089](0089-2026-10-15-floor-editor.md) choice 3), then sends each pending change as its own changeset, in order. A refusal then names exactly one change. It costs a few more requests after quick bursts of edits.
- **Messages** are translated by the server's error code ([0081](0081-2026-10-10-drafts-and-changesets.md)), with the server's English message as a fallback for codes the editor doesn't know yet.
- **Problems stay until dismissed** (×) or until the draft is loaded again. Phase 3b's live checks will add and clear their own entries as the plan changes.
- A refused **undo or redo** (rare) can't be matched to the history, so the undo history starts over in that case.
