# 0141 — No merge commits in a PR, and CI checks it

- **Date:** 2026-11-11
- **Status:** Accepted
- **Refines:** [0069](0069-2026-10-08-rebase-merges.md) (rebase-only merges), [0070](0070-2026-10-08-ci-gate-job.md) (the `ci-ok` gate)

## Context
Merges are rebase-only ([0069](0069-2026-10-08-rebase-merges.md)), and a branch catches up with `main` by rebasing and pushing with `--force-with-lease` ([git guide](../guides/git.md#catching-up-and-restacking)). Still, PR #157 got merge commit `eee288a`, which merged `main` into the branch.

The cause was Auto-fix ([0134](0134-2026-11-09-from-request-to-main.md)). When a PR has a merge conflict, the app wakes the session and tells it to merge `main` into the branch, and never to rebase or force-push. The session did what that message said. HSP's rule was in the git guide, which the session didn't reread at that moment. Nothing it had in front of it said the rule wins over Auto-fix's message.

The owner asked for the merge commit to be rebased out and for this not to happen again.

## Options considered
- **A CI check that fails on any merge commit in a PR, plus the rule in `CLAUDE.md` and the git guide** ✅ `CLAUDE.md` is always in a session's context, so the rule is there when Auto-fix's message arrives. If a merge commit gets pushed anyway, `ci-ok` fails, the PR can't merge, and Auto-fix wakes the session with the error, which says how to fix it.
- The rule in the git guide only. That's where it was when #157 got its merge commit.
- The ruleset's "Require linear history". It guards `main`, not the PR's branch. Rebase merges already keep `main` linear, so it would catch nothing new.
- A Claude Code hook that blocks `git merge` and `git pull` without `--rebase`. It stops the merge before it's made, but it has to read shell commands from both Bash and PowerShell, and it only covers sessions that load the project's settings. Set aside unless the CI check proves not enough.
- Turn off Auto-fix's handling of conflicts. The app has no setting for it.

## Decision
- **A PR carries no merge commits.** To catch up with `main` or a lower PR in a stack, rebase and push with `--force-with-lease`. That includes when Auto-fix reports a merge conflict and says to merge: rebase instead. *(The owner's choice)*
- **A `linear-history` CI job** runs on every pull request and fails if any commit between the PR's base and its head has more than one parent. Its error says how to fix it. It's in `ci-ok`'s `needs`, so it's enforced without a ruleset change. *(Claude's choice)*
- **The rule sits in `CLAUDE.md`** under "Before you push", and in the git guide under "Catching up and restacking". *(Claude's choice)*

## Consequences
- `.github/workflows/ci.yml` gets the `linear-history` job.
- `CLAUDE.md` and [the git guide](../guides/git.md) say to rebase even when Auto-fix says to merge.
- A PR that already carries a merge commit fails `ci-ok` until it's rebased.
