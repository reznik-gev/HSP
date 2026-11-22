# 0154 — Stacked PRs stay as they are until after 1.3, and then the workflow is simplified

- **Date:** 2026-11-22
- **Status:** Accepted
- **Refines:** [0093](0093-2026-10-16-github-stacked-prs.md) (GitHub stacks with `gh stack` stay for now), [0153](0153-2026-11-22-when-sessions-use-github-auto-merge.md) (point 7 left how stacks work to their own decision)

## Context
While reviewing [#192](https://github.com/reznik-gev/MusicalChairs/pull/192) (decision [0153](0153-2026-11-22-when-sessions-use-github-auto-merge.md), auto-merge), the owner found that stacks made the skills too complex. `merge-pr` needs loops to merge up to a PR, a restack between merges, and a new go-ahead for each. 0153 point 7 kept auto-merge for single PRs only, and left how stacks work to a decision of their own.

The owner's goal, in their words: "single PRs, that CAN stack upon each other, but are reviewed and rebased in turn and as singular PRs. If PR Y is based on PR X, it CAN'T be merged, and every skill or click should refuse merging it, until X is merged itself."

Three ways to get there were tried in [#193](https://github.com/reznik-gev/MusicalChairs/pull/193). Each was set aside:
- **Every PR's base is `main`, and a CI job fails a PR that holds another open PR's commits.** It was built and tested on GitHub with a throwaway PR. The review bot found it could be got around: once X gets a review fix or a rebase, Y no longer holds X's head commit, and Y passes. Reading a "Builds on #X" line in the description would close that gap. The owner turned both down: **Git matters should be solved by Git itself, not by a CI job or a comment on the PR.**
- **Y stays a pushed branch with no PR until X merges.** Nothing can merge it, and it's plain Git. The owner turned it down: **it holds up CI and reviews, one PR at a time.**
- **Y's PR targets X's branch, with a ruleset that stops merges into feature branches.** Y could then reach `main` only through X. But GitHub's rulesets can't do it: no rule limits which branch a PR may target. "Restrict updates" and "Require a pull request" block pushes too, and no bypass mode allows pushing but not merging. A required status check that nothing ever reports might work, but GitHub's docs don't say whether it also blocks pushes. The owner turned this down too.

## Options considered
- **Keep stacks as they are for now, and simplify the workflow after 1.3** ✅. The work planned up to 1.3 ([0104](0104-2026-10-21-v1-release-scope-and-support.md), [0108](0108-2026-10-21-first-client-demo-feedback.md), [0145](0145-2026-11-11-office-moves.md)) goes on with a workflow that works today.
- Pick one of the three ways above now ❌: each breaks one of the owner's conditions (below).
- Stop stacking PRs altogether ❌: PRs get bigger, or wait for each other, which holds up CI and reviews.

## Decision
1. **Stacks stay as they are:** GitHub stacks with `gh stack` ([0093](0093-2026-10-16-github-stacked-prs.md)), merged as [0153](0153-2026-11-22-when-sessions-use-github-auto-merge.md) point 7 says, with no auto-merge. The skills and guides don't change. *(The owner's choice.)*
2. **The stacked PR workflow is simplified after 1.3,** once the work planned up to 1.3 is done. Its own decision record will say how. *(The owner's choice.)*
3. **What the new workflow must do** *(the owner's conditions, from #193's review)*:
   - Each PR is reviewed, rebased and merged on its own.
   - A PR built on another can't be merged, by a skill or a click, until the one below has.
   - CI and reviews run on every PR in the stack at once, not one PR at a time.
   - Git matters are solved by Git and GitHub's own settings, not by a CI job or a comment on the PR.
   - The skills get simpler than they are today.
4. **What #193 found stays useful later** *(Claude's choice)*: the three ways above, and why each was set aside. One question is still open: does a ruleset that requires a status check nothing reports block pushes too, or only merges? It can be tried on throwaway branches, with the owner's OK.

## Consequences
- Nothing changes in the skills, the guides or CI now. #193 closes without merging.
- After 1.3, a session takes up point 2: it checks the open question in point 4 and brings the owner options that meet point 3.
- Until then, `merge-pr` keeps its stack steps, and the owner's "merge #N" in a stack covers #N and every PR below it ([0153](0153-2026-11-22-when-sessions-use-github-auto-merge.md)).
