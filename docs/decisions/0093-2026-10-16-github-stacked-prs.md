# 0093 — Stacked PRs with GitHub's own stacks (`gh stack`)

- **Date:** 2026-10-16
- **Status:** Accepted
- **Supersedes:** [0079](0079-2026-10-08-stacked-pr-workflow.md) (its restack script; parent-based PRs and auto-retargeting stand)
- **Refines:** [0064](0064-2026-10-08-branching-workflow.md), [0069](0069-2026-10-08-rebase-merges.md)

## Context
[0079](0079-2026-10-08-stacked-pr-workflow.md) kept stacked PRs workable under rebase-only merges ([0069](0069-2026-10-08-rebase-merges.md)) with our own `scripts/restack.sh`. It rejected adopting a third-party stacking tool (Graphite, git-town) and said to revisit a dedicated tool if restacking became painful.

Since then GitHub has built stacks into the product. Stacked pull requests went into private preview in April 2026 and opened to every repository, in public preview, at the end of July 2026. A stack is now an object on GitHub: the PR pages show the whole chain, and a stack can be merged up to any PR in one all-or-nothing step. The `gh stack` extension to the GitHub CLI manages the branches locally.

Tried on the phase 3b stack (#65–#69, GitHub stack #70) on 2026-10-16:
- `gh stack init` adopted the existing branches. `gh stack sync` rebased them onto `main` after #64 merged, pushed them and created the stack on GitHub.
- `gh stack merge 65 --rebase` merged #65 alone. `gh stack sync --prune` then saw #65 was merged, skipped its branch, rebased #66–#69 (one commit each, no old copies), moved #66 to target `main` and deleted the local branch.
- The result matched what `scripts/restack.sh` produced, without having to name the top branch, and the stack is visible to reviewers on GitHub.

## Options considered
- **GitHub stacks with `gh stack`** ✅: built in, free, no new account; the CLI comes from GitHub.
- Keep `scripts/restack.sh` ❌: works, but it's our code to maintain, and GitHub doesn't know the PRs form a stack.
- Use both ❌: two ways to do the same thing; the script adds nothing `gh stack sync` lacks except the local checks, and CI runs those anyway.

## Decision
1. **Stacks are GitHub stacks**, managed with `gh stack` (install: `gh extension install github/gh-stack`). Each PR still targets the branch below it, and "Automatically delete head branches" stays on ([0079](0079-2026-10-08-stacked-pr-workflow.md) points 1–2).
2. **Starting a stack:** `gh stack init <first-branch>`, then `gh stack add <next-branch>` per layer, and `gh stack submit` to open the PRs and group them. Branches that already have open PRs are adopted with `gh stack init <bottom> … <top>` (then `gh stack sync`).
3. **Merging stays bottom-up and rebase-only.** Merge on github.com as before, or with `gh stack merge <PR> --rebase`, which merges that PR and every unmerged one below it in one step. Review comments are checked right before each merge, as before.
4. **After every merge: `gh stack sync --prune`.** It fetches, rebases the rest of the stack onto `main`, pushes with `--force-with-lease`, updates the stack on GitHub and deletes merged local branches.
5. **`scripts/restack.sh` is removed.** [docs/guides/stacked-prs.md](../guides/stacked-prs.md) is rewritten for `gh stack` and keeps the plain-Git way of doing it by hand.

## Consequences
- One command after a merge, from any branch in the stack, and reviewers see the stack on GitHub.
- Local checks no longer run during a restack. CI runs them on every pushed branch, and `ci-ok` still gates merging ([0070](0070-2026-10-08-ci-gate-job.md)).
- `gh stack init` only recognises **open** PRs. Adopting branches that are already merged would push a deleted branch back, so a stack should be set up before anything in it merges.
- In `gh stack merge <number>`, a number is read as a stack number first, then as a PR. Stacks and PRs share GitHub's numbering, so the two don't collide, but a PR's URL removes any doubt.
- The feature is a **public preview** and may change. If it's withdrawn or breaks, the plain-Git steps in the guide still work, and `scripts/restack.sh` can be restored from history.
