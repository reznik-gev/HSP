# Working with Git and pull requests

How changes get from a branch to `main`: branches, commits, reviews and merging. Stacks of PRs have their own guide, [Working with stacked pull requests](stacked-prs.md). The whole path of a change, from the owner's request to the cleanup after merging, is in [How a change is made](making-a-change.md). The decisions behind this are [0064](../decisions/0064-2026-10-08-branching-workflow.md) (trunk-based branches), [0069](../decisions/0069-2026-10-08-rebase-merges.md) (rebase-only merges), [0070](../decisions/0070-2026-10-08-ci-gate-job.md) (the `ci-ok` gate), [0093](../decisions/0093-2026-10-16-github-stacked-prs.md) (GitHub stacks), [0134](../decisions/0134-2026-11-09-from-request-to-main.md) (who asks for re-reviews, and merging) and [0141](../decisions/0141-2026-11-11-no-merge-commits-in-a-pr.md) (no merge commits in a PR).

## Branches and commits
- Every change is a short-lived branch and a pull request into `main` (or into the PR below it, in a stack). Name branches by area and topic: `editor/height-cues`, `admin/devices`, `docs/testing-guide`.
- Merges are **rebase-only**, so every commit lands on `main` as it is. Make each one a meaningful step that passes the checks on its own.
- Commit messages: a short summary line that says what changes for someone using HSP, then a body explaining why, with the decision records it follows.
- **Who wrote it.** A Claude Code session set up for the owner's GitHub App commits as `reznik-gev-claude[bot]` ([0139](../decisions/0139-2026-11-10-how-sessions-get-the-apps-tokens.md), [github-app-token](https://github.com/reznik-gev/GevTools/blob/main/github-app-token/README.md) in GevTools). Its messages end with two lines: `Co-Authored-By:` for the owner, with the name and email from `git config user.name` and `git config user.email`, and then the one for Claude. A session not set up for the App commits as the owner, with only Claude's line.

## Pull requests
- The description says what changes for the user, how it's built, what was decided along the way and how it was tested, including what wasn't tested.
- A PR that changes something users or operators notice adds a line to `CHANGELOG.md` under **Unreleased** ([how](releasing.md#between-releases-keep-the-changelog)).
- `ci-ok` must pass before a PR merges.
- **Claude reviews** each PR when it's opened or marked ready, but not while it's a draft. It checks guide and decision compliance and maintainability ([0101](../decisions/0101-2026-10-19-claude-reviews-only.md)). Comment `@claude review` to have it look again. The session that opened the PR does this itself after each round of fixes, up to three bot rounds in all ([0134](../decisions/0134-2026-11-09-from-request-to-main.md)). Mention `@claude` anywhere else to ask it something. It answers with comments and suggestions and never changes code; coding happens in Claude Code sessions.

## Review fixes are new commits
**Fixes for review comments always go in as new commits on top of the PR.** Never amend, squash, fixup or otherwise rewrite commits that have been reviewed, so the reviewer can see exactly what changed since they looked. This holds when the only reviewer was the review bot, and when the bot itself asks for a commit to be reworded: reply that rewording needs the owner's permission, leave the commit as it is, and tell the owner.
- One commit per review round, or per comment when they're unrelated. The message says which review it answers ("Review on #80: …").
- **Reply to every comment**, saying what changed and in which commit (its short hash), or answering the question. A comment that only asks something gets an answer, not necessarily a change.
- A fix that changes behaviour users notice is the owner's question, not a quiet fix.

Claude Code sessions get a PR ready for the owner's review with the [`prepare-pr-for-review`](../../.claude/skills/prepare-pr-for-review/SKILL.md) skill: restack, fix the review bot's comments, reply and resolve, and bring the owner whatever needs their choice.

### Threads Claude Code sessions may resolve
- A thread **only the review bot wrote in** (author `github-actions`): once it's fixed, reply with the commit's short hash and resolve it. No need to ask. If it's a disagreement or a choice for the owner, leave it open until the owner answers.
- A thread **anyone else wrote in**, the owner included: don't reply or resolve until the owner has answered. Show the owner the thread and your planned reply.

### Read back what you post
After posting a comment, a reply or a PR description with `gh`, read it back from GitHub and check the text arrived as written, before saying it's done. In PowerShell, pass the body as a plain variable or `"body=$($x)"`, never `name=$hash[$key]`: that posts the hashtable's type name instead of the text.

## Catching up and restacking
Bringing a branch up to date with `main`, or restacking a stack after a merge, **rebases and force-pushes**: `gh stack sync`, or `git rebase origin/main` and `git push --force-with-lease`. That's expected and needs no one's permission. It's the price of a linear `main` ([0069](../decisions/0069-2026-10-08-rebase-merges.md)). It replays the same commits; it doesn't change what was reviewed. `--force-with-lease` refuses to overwrite anything someone else pushed in the meantime.

**Never merge `main` (or the PR below) into a branch.** That holds when Auto-fix reports a merge conflict and says to merge `FETCH_HEAD`: rebase instead, settle the conflicts, run the checks and push with `--force-with-lease`. The `linear-history` CI job fails any PR that carries a merge commit ([0141](../decisions/0141-2026-11-11-no-merge-commits-in-a-pr.md)).

**Any other force-push needs the owner's yes first**, for example amending or rewording a commit already pushed. To fix your own just-pushed commit, add a new commit. Claude Code's auto mode may still block a rebase push; if it does, tell the owner, who can add a permission rule.

## Merging
- **Right before merging, look at the PR's comments again.** If anything is new and unanswered, handle it first, even when the owner said to merge earlier.
- Merge with **Rebase and merge**, or with `gh stack merge <PR number> --rebase` in a stack. Then catch the rest of the stack up with `gh stack sync --prune`.
- After merging, delete the branch (GitHub does it for merged PRs; `--prune` does it locally), and the PR's `reserve/decision-*` branches. A PR that closes without merging also gets its `reserve/` branches deleted, so its numbers are free again.
- **What starts a merge:** for a PR opened as the App, the owner's approval on GitHub. For a PR opened with the owner's own account, the owner saying "merge #N" ([0137](../decisions/0137-2026-11-10-a-github-app-for-claude-code-sessions.md)). The owner can't approve such a PR and the App has no bypass, so the owner merges it on GitHub with their bypass, after the session's last checks ([0143](../decisions/0143-2026-11-11-the-owner-merges-their-own-prs.md)).
- Claude Code sessions merge with the [`merge-pr`](../../.claude/skills/merge-pr/SKILL.md) skill, which also cleans up after a merge the owner made on GitHub, or after a PR closed without merging.
