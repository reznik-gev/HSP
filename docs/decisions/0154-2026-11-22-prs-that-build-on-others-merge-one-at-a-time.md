# 0154 — A PR may build on another, but merges on its own into `main`, after the one below it

- **Date:** 2026-11-22
- **Status:** Accepted
- **Supersedes:** [0093](0093-2026-10-16-github-stacked-prs.md) (GitHub stacks and `gh stack`), and what was left of [0079](0079-2026-10-08-stacked-pr-workflow.md) (a stacked PR targets the branch below it)
- **Refines:** [0069](0069-2026-10-08-rebase-merges.md) (rebase-only merges), [0070](0070-2026-10-08-ci-gate-job.md) (the `ci-ok` gate gets a new job), [0134](0134-2026-11-09-from-request-to-main.md) (the path of a change), [0153](0153-2026-11-22-when-sessions-use-github-auto-merge.md) (auto-merge, which no longer needs a rule for stacks)

## Context
Since [0093](0093-2026-10-16-github-stacked-prs.md), a stack of PRs is a GitHub stack: each PR targets the branch of the PR below it, and `gh stack merge` merges a PR together with every unmerged PR below it. While reviewing [#192](https://github.com/reznik-gev/HSP/pull/192) (decision [0153](0153-2026-11-22-when-sessions-use-github-auto-merge.md), auto-merge), the owner found that stacks made the skills too complex: `merge-pr` needed loops for merging up to a PR, a restack between merges, and a new go-ahead for each. They chose that 0153 covers single PRs only, and that stacks get a rule of their own.

The owner's rule, in their words: "single PRs, that CAN stack upon each other, but are reviewed and rebased in turn and as singular PRs. If PR Y is based on PR X, it CAN'T be merged, and every skill or click should refuse merging it, until X is merged itself."

Two things about GitHub shaped how this is enforced:
- A PR whose base is another PR's branch merges **into that branch**, not into `main`. The `main` rulesets (`ci-ok`, approvals) don't cover it, so nothing stops a click on Y.
- GitHub can't block merges into feature branches without also blocking pushes to them.

No stack is open today: every open PR targets `main`.

## Options considered
- **Every PR's base is `main`, and a CI job in `ci-ok` fails while the PR holds another open PR's commits** ✅. `ci-ok` is the required check on `main`, so GitHub refuses the merge however it's asked for: a click, auto-merge or `gh`.
- Keep GitHub stacks, and ask sessions not to merge Y first ❌: a click on GitHub would still merge Y into X's branch, and the skills stay complex.
- A ruleset on every branch that needs `ci-ok` ❌: it would block pushes to feature branches too.
- A label or a "Depends on #X" line in the description, checked by CI ❌: easy to forget, and the commits already say which PR is below.

## Decision
1. **Every PR's base is `main`.** A PR Y that builds on X is cut from X's branch, so it holds X's commits too, and its diff shows them until X merges. GitHub stacks and PRs based on another PR's branch are not used any more. *(The owner's choice.)*
2. **The `builds-on-open-pr` CI job** in [`ci.yml`](../../.github/workflows/ci.yml), which `ci-ok` needs, fails a PR when *(the owner's choice; the checks' details are Claude's choice)*:
   - its base isn't `main`;
   - it holds the head commit of another open PR that isn't on `main`. The failure names those PRs. When two PRs have the same head commit, the newer one is the one built on the other;
   - it holds copies of commits already on `main` (`git cherry`). That's Y after X merged, before Y was rebased: without this, re-running Y's CI after X merges would pass while Y still holds X's old commits. *(Claude's choice.)*
   - it couldn't fetch an open PR's head, so it can't tell. *(Claude's choice: a gate fails when it doesn't know.)*

   It runs on PRs only, not on pushes to `main`. It reads the list of open PRs (`pull-requests: read`) and fetches every PR's head, forks' too.
3. **Y stays a draft while X is open.** The review bot skips drafts, so it reviews Y once, on its own commits, after the rebase, and not X's commits again. *(The owner's choice.)*
4. **When X merges, the session rebases Y onto `main`, pushes with `--force-with-lease` and marks it ready.** Nothing re-runs Y's CI when X merges; the rebase push does. Y then goes through its review rounds and merges like any PR, on the owner's word. *(The owner's choice.)*
5. **`gh stack` leaves the workflow**: `gh stack merge`, `submit`, `sync` and the rest. Building Y on X's branch and rebasing it later is plain Git, and the [stacked PRs guide](../guides/stacked-prs.md) shows how. *(Claude's choice: with one PR rebased at a time, the extension saves nothing, and it was a public preview.)*
6. **A chain of more than two works the same way.** W on Y on X stays a draft until both have merged; the job names both. Each PR is rebased once the PR right below it has merged. *(Claude's choice.)*

## Consequences
- `merge-pr` merges one PR, never a stack, and its stack loops go. After a merge it rebases any draft built on the merged PR and marks it ready. `open-pr` opens a PR built on another as a draft with base `main`. `prepare-pr-for-review` restacks with a plain rebase. The [git guide](../guides/git.md), [How a change is made](../guides/making-a-change.md) and the [stacked PRs guide](../guides/stacked-prs.md) say the same.
- [0153](0153-2026-11-22-when-sessions-use-github-auto-merge.md) point 7 (auto-merge never for a stack) needs no special case now: every PR merges on its own. A draft can't have auto-merge turned on, and Y's `ci-ok` fails while X is open, so auto-merge can't merge Y early either.
- While Y is a draft, its diff on GitHub includes X's commits. To see Y's own changes, compare X's branch with Y's on GitHub.
- When X gets review fixes after Y was cut, Y's copies of X's commits no longer match what lands on `main`. The rebase then replays only Y's own commits (`git rebase --onto`), as the guide shows.
- If X closes without merging, Y still holds X's commits and passes CI. The session drops X's commits from Y, or asks the owner.
- `git cherry` only spots copies that match a commit on `main` exactly. If X changed after Y was cut, a re-run of Y's CI without a rebase can pass; the rebase in point 4 is still needed. A commit that rightly matches one on `main`, such as one applied again after a revert, fails the job too. That's rare, and the owner decides then.
- "Automatically delete head branches" stays on. It no longer retargets anything, since no PR's base is another PR's branch.
