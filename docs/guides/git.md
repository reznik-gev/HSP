# Working with Git and pull requests

How changes get from a branch to `main`: branches, commits, reviews and merging. Stacks of PRs have their own guide, [Working with stacked pull requests](stacked-prs.md). The decisions behind this are [0064](../decisions/0064-2026-10-08-branching-workflow.md) (trunk-based branches), [0069](../decisions/0069-2026-10-08-rebase-merges.md) (rebase-only merges), [0070](../decisions/0070-2026-10-08-ci-gate-job.md) (the `ci-ok` gate) and [0093](../decisions/0093-2026-10-16-github-stacked-prs.md) (GitHub stacks).

## Branches and commits
- Every change is a short-lived branch and a pull request into `main` (or into the PR below it, in a stack). Name branches by area and topic: `editor/height-cues`, `admin/devices`, `docs/testing-guide`.
- Merges are **rebase-only**, so every commit lands on `main` as it is. Make each one a meaningful step that passes the checks on its own.
- Commit messages: a short summary line that says what changes for someone using HSP, then a body explaining why, with the decision records it follows.

## Pull requests
- The description says what changes for the user, how it's built, what was decided along the way and how it was tested, including what wasn't tested.
- `ci-ok` must pass before a PR merges.
- **Claude reviews** each PR when it's opened or marked ready, for guide and decision compliance and maintainability ([0101](../decisions/0101-2026-10-19-claude-reviews-only.md)). After review fixes, comment `@claude review` to have it look again. Mention `@claude` anywhere else to ask it something. It answers with comments and suggestions and never changes code; coding happens in Claude Code sessions.

## Review fixes are new commits
**Fixes for review comments always go in as new commits on top of the PR.** Never amend, squash, fixup or otherwise rewrite commits that have been reviewed, so the reviewer can see exactly what changed since they looked.
- One commit per review round, or per comment when they're unrelated. The message says which review it answers ("Review on #80: …").
- **Reply to every comment**, saying what changed and in which commit (its short hash), or answering the question. A comment that only asks something gets an answer, not necessarily a change.

## Catching up and restacking
Bringing a branch up to date with `main`, or restacking a stack after a merge, **rebases and force-pushes**: `gh stack sync`, or `git rebase origin/main` and `git push --force-with-lease`. That's expected and needs no one's permission. It's the price of a linear `main` ([0069](../decisions/0069-2026-10-08-rebase-merges.md)). It replays the same commits; it doesn't change what was reviewed. `--force-with-lease` refuses to overwrite anything someone else pushed in the meantime.

## Merging
- **Right before merging, look at the PR's comments again.** If anything is new and unanswered, handle it first, even when the PR was approved earlier.
- Merge with **Rebase and merge**, or with `gh stack merge <PR number> --rebase` in a stack. Then catch the rest of the stack up with `gh stack sync --prune`.
- After merging, delete the branch (GitHub does it for merged PRs; `--prune` does it locally).
