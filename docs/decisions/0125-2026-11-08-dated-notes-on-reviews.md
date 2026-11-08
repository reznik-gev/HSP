# 0125 — Reviews get short dated notes when a finding changes

- **Date:** 2026-11-08
- **Status:** Accepted
- **Relates to:** [0075](0075-2026-10-08-docs-directory-structure.md) (the docs directory), [0110](0110-2026-10-22-repositories-after-1-2.md) and [0111](0111-2026-10-23-cpu-and-memory-from-the-platform.md) (two findings already marked this way)

## Context
A review in [`docs/reviews/`](../reviews/README.md) describes the code at one commit. Its README first said a review "is not updated afterwards", so that it stays a true picture of that commit.

But findings change after a review is written. Two were already marked in the reviews themselves before they merged: the maintainability review marks its recommendation 4 as decided (0110), and the dependencies review notes that psutil was removed (0111). By 2026-11-08, two more were out of date: the flaky browser tests were fixed in #126, and record 0109, cited before it existed, now exists. A reader who follows a review's advice should not act on a finding that is no longer true.

The options:
- **No changes after a review is written.** It stays a pure snapshot. What changed lives only in the decision log, so a reader has to look there.
- **Short dated notes** where a finding changed. The rest of the review stays as written.
- **Keep reviews up to date.** They stop describing one commit, and keeping them current is real work.

## Decision
The owner chose **short dated notes**. When a finding is fixed, decided, or no longer true, a note right after it says so: *Update, YYYY-MM-DD*, then what changed, with a link to the PR or record. The finding's own text stays as written. Anything bigger, such as new measurements or new findings, waits for a later review, which replaces the old one.

## Consequences
- A review still shows what was true at its commit, and also which of its findings no longer are.
- Small changes since a review, such as a slightly different measurement, get no note.
