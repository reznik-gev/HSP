# 0148 — Every commit message has a body, checked by a git hook and by CI

- **Date:** 2026-11-18
- **Status:** Accepted
- **Refines:** [0069](0069-2026-10-08-rebase-merges.md) (each commit lands on `main` as it is, so its message must stand on its own), [0070](0070-2026-10-08-ci-gate-job.md) (`ci-ok` requires the new `commit-messages` job), [0062](0062-2026-10-08-code-quality-tooling.md) (the optional `pre-commit` checks run from `.githooks`)

## Context
The [git guide](../guides/git.md#commit-messages) asks for a short summary line and then a body that says why, with the decision records the commit follows. Merges are rebase-only ([0069](0069-2026-10-08-rebase-merges.md)), so every message lands on `main` as written.

In practice about 1 commit in 10 on `main` has no body. Most are review fixes ("Review on #N: …"), commits made with GitHub's "Apply suggestion" or "Update file" buttons, and early decision commits. Once, PowerShell quoting put a whole body on the summary line, making it 560 characters long.

Three things let this happen:
- The skills where sessions commit gave only the summary line's format.
- Nothing checked the message before the push.
- The review bot notices after the push. By then, rewording needs a force-push, which needs the owner's yes ([git guide](../guides/git.md#catching-up-and-restacking)), so it was never fixed.

The owner asked for every commit to have a body from the first time it's made.

## Options considered
- **A local `commit-msg` hook, the format in the skills, and a CI job as a backstop** ✅
- A local hook and the skills only. Set aside: the hook only runs in clones that turn it on, and never for commits made on GitHub, so body-less commits could still reach `main`.
- The skills only. Set aside: that's close to what failed before.
- The review bot only. Set aside: it notices after the push, which is too late to fix without a force-push.

## Decision
1. **The message's shape.** A summary line, a blank line, and a body of at least one line that says why. `Co-Authored-By:` and `Signed-off-by:` lines don't count as a body. The summary line is at most **100 characters**. *(Claude's choice: on `main`, the longest proper summary lines are 97 and 98 characters, and 3 of 423 commits go over 100, one of them the 560-character body on the summary line. A tighter limit like 72 would have rejected 70 of them.)*
2. **The hook.** `.githooks/commit-msg` (POSIX `sh`, for Git Bash on Windows and for Linux) rejects a commit that breaks point 1. It lets `fixup!`, `squash!` and `amend!` commits through, since they are folded into another commit before a push. `git commit-tree`, which [`record-decision`](../../.claude/skills/record-decision/SKILL.md) uses to reserve a number, runs no hooks, so it isn't affected. *(Claude's choice)*
3. **Turning it on.** Each clone runs `git config core.hooksPath .githooks` once. The README's quick start and the git guide say so. With `core.hooksPath` set, `pre-commit install` refuses to run, so `.githooks/pre-commit` runs the checks in `.pre-commit-config.yaml` ([0062](0062-2026-10-08-code-quality-tooling.md)) when the `pre-commit` tool is installed, and does nothing when it isn't. *(Claude's choice)*
4. **Where sessions commit.** [`open-pr`](../../.claude/skills/open-pr/SKILL.md), [`prepare-pr-for-review`](../../.claude/skills/prepare-pr-for-review/SKILL.md) and [`record-decision`](../../.claude/skills/record-decision/SKILL.md) give the format, with one example. They tell sessions to write the message to a file and commit with `git commit -F <file>`, because PowerShell mangles a multi-line `-m`. "Review on #N: …" fixes need a body too. The review bot's suggestions are applied locally with a proper message, not with GitHub's "Apply suggestion" button. *(Claude's choice)*
5. **The CI backstop.** A `commit-messages` job in `.github/workflows/ci.yml`, run on pull requests like `linear-history`, checks every commit between the base and the head with the same hook. It also fails a `fixup!`, `squash!` or `amend!` commit, since a rebase merge would land it on `main` as it is. `ci-ok` requires the job ([0070](0070-2026-10-08-ci-gate-job.md)). *(The owner's choice)*

## Consequences
- When the CI job fails, the fix is to reword the commit and force-push, which still needs the owner's yes. That includes commits the owner makes on GitHub.
- PRs open when this merges may fail the job on their older commits once they're restacked.
- CI's `scripts` job runs `shellcheck` on `.githooks/` too.
- The hook counts characters with `wc -m`, which counts bytes in a locale without UTF-8. A summary line with non-ASCII characters may then look a little longer than it is.
