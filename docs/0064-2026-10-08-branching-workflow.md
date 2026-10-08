# 0064 — Branching workflow: trunk-based with pull requests

- **Date:** 2026-10-08
- **Status:** Accepted

## Options considered
- **Trunk-based + PRs** ✅
- GitFlow
- Direct commits to main

## Decision
- `main` is always releasable and protected: changes land only through **pull requests** with **required CI checks** ([0053](0053-2026-10-08-code-hosting-and-ci.md)) and a linear history (squash merge).
- Feature branches are short-lived (days, not weeks). Unfinished features are hidden behind configuration flags rather than kept on long branches.
- **Releases** are tags `vX.Y.Z` on `main` ([0063](0063-2026-10-08-release-versioning.md)).
- **Hotfixes for older on-prem versions:** create `release/X.Y` from the tag, cherry-pick the fix from `main`, and tag `vX.Y.(Z+1)`.
- Decision records (`docs/`) go through PRs like code.

## Consequences
- Simple history, and CI gates everything.
- Customers stay on older versions on-prem, so maintained `release/X.Y` branches may accumulate. The supported-versions policy (e.g. current and previous MINOR) is defined before the first release.
