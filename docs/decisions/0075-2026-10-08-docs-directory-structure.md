# 0075 — Documentation structure: decision records move to `docs/decisions/`

- **Date:** 2026-10-08
- **Status:** Accepted

## Context
Until now `docs/` held only decision records. Other kinds of documentation are coming, such as demos and user tutorials, and mixing them into one flat folder of 75+ numbered files would make both hard to find.

## Decision
- Decision records and their index live in **`docs/decisions/`**. The file naming (`NNNN-YYYY-MM-DD-slug.md`) and numbering are unchanged.
- **`docs/README.md`** is now a short hub that lists each documentation section.
- Each new kind of documentation gets its **own subdirectory** under `docs/` (e.g. `docs/demos/`, `docs/tutorials/`) with its own `README.md` index, and a row in the hub.
- The move is a pure relocation:
  - no decision changed
  - links between records still work, since they're relative within the same directory
  - links from records to the rest of the repo, and from the rest of the repo to records, were rewritten
- **Shorthand in code comments:** comments such as `# (docs/0052)` mean "decision record 0052". They are references, not file paths, and were deliberately **not** rewritten across ~50 source files. New comments may use either `docs/NNNN` or `docs/decisions/NNNN`. Markdown files must always use real, working relative links.

## Consequences
- Old URLs like `docs/0052-…md` (e.g. bookmarked GitHub links) no longer resolve. Git history keeps the move, and `git log --follow` traces each file.
- The decision-log rules (immutability, the rename exception from [0072](0072-2026-10-08-rename-hsm-to-hsp.md)) are unchanged and live in [`docs/decisions/README.md`](README.md).
