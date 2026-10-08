# 0079 — Stacked PR workflow: parent-based PRs, auto-retarget, restack script

- **Date:** 2026-10-08
- **Status:** Accepted
- **Refines:** [0064](0064-2026-10-08-branching-workflow.md), [0069](0069-2026-10-08-rebase-merges.md), [0076](0076-2026-10-08-backend-delivery-plan.md)

## Context
The first stack of backend PRs (#11 → #16) showed the cost of combining small stacked PRs ([0076](0076-2026-10-08-backend-delivery-plan.md)) with **rebase-only merges** ([0069](0069-2026-10-08-rebase-merges.md)). Every merge gave the merged commits new IDs. Each PR higher in the stack still carried the old copies, and GitHub showed it as conflicting. Each one needed a manual rebase and force-push, and it was unclear how to do that without help.

Switching to merge commits would avoid the ID rewrite, but that was explicitly rejected in 0069. So the fix is in the workflow and tooling instead.

## Options considered (multi-select)
- **Stacked PRs target their parent branch** ✅
- **Restack script + guide** ✅
- Limit stack depth to 2 ❌
- Adopt a stacking tool (Graphite, git-town) ❌

## Decision
1. **Parent-based PRs:** in a stack, each PR targets the branch of the PR below it, not `main`. Reviewers see only that PR's changes.
2. **"Automatically delete head branches" is enabled** in the repository settings. When a PR merges, its branch is deleted and GitHub **retargets the next PR to `main`** automatically.
3. **`scripts/restack.sh`** restacks the whole stack in one command after each merge:
   - fetch
   - detect merged branches **by comparing patches** (`git cherry`, since rebase-merges change commit IDs)
   - `git rebase --update-refs origin/main`
   - run checks for the touched areas
   - `git push --force-with-lease`
4. **Guide:** [docs/guides/stacked-prs.md](../guides/stacked-prs.md) explains why restacking is needed, how to run the script, and how to resolve a real conflict by hand. It's the first document in the new `docs/guides/` section ([0075](0075-2026-10-08-docs-directory-structure.md)).

## Consequences
- After merging a stacked PR, the person merging (or Claude) runs one command instead of a manual rebase per PR.
- Force-pushes to PR branches remain normal, and `--force-with-lease` prevents overwriting someone else's work.
- Stack depth stays unconstrained. If restacks become painful anyway, revisit the depth limit or a dedicated tool.
- The script was tested against a simulated rebase-merge stack: sequential merges, a real conflict with resolve-and-resume, and a fully merged stack.
