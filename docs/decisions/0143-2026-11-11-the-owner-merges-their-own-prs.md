# 0143 — The owner merges PRs opened from their own account, on GitHub

- **Date:** 2026-11-11
- **Status:** Accepted
- **Refines:** [0137](0137-2026-11-10-a-github-app-for-claude-code-sessions.md) (point 4: how PRs from the owner's account merge), [0139](0139-2026-11-10-how-sessions-get-the-apps-tokens.md) (point 7: `--admin` for those PRs)

## Context
[0139](0139-2026-11-10-how-sessions-get-the-apps-tokens.md) point 7 says a session merges a PR opened from the owner's account with `gh pr merge --admin`, using the owner's bypass of the `main-approvals` ruleset. That only works when the session acts as the owner. Sessions now act as the App, `reznik-gev-claude[bot]`, and the App has no bypass.

PR #156 showed it on 2026-11-11. The owner opened it from their own account. A session acting as the App pushed review fixes to it. Then:
- the owner couldn't approve it: GitHub never lets anyone approve their own PR;
- `gh pr merge 156 --rebase --admin`, run as the App, was refused: the App has no bypass.

The owner merged it by hand on GitHub, with their own bypass.

Who pushed last doesn't matter here. A PR opened from the owner's account can never get an approval, so a session acting as the App can never merge it. On 2026-11-11 three such PRs were open: #153, #157 and #159. New PRs from local sessions are opened as the App, so these PRs are only cloud sessions', the owner's own, and older ones.

## Options considered
- **The owner merges them on GitHub, with their bypass** ✅. The session still does `merge-pr`'s last checks first (new comments, `ci-ok`, mergeable), tells the owner it's ready, and cleans up once it sees the merge. No ruleset change. One extra click for the owner, and fewer such PRs as time goes on.
- The session opens a new PR from the same branch as the App, and closes the owner's PR with a link. The owner then approves it like any App PR, so the approval stays the go-ahead for everything. But the review history splits across two PRs, and the bot reviews again.
- Sessions don't push to PRs from the owner's account, and open their own PR or hand back. On its own this doesn't help: the PR still can't be approved, so the App still can't merge it.
- Give the App a bypass of `main-approvals`. Sessions could then merge with no approval at all. That undoes 0137 point 3: the App never merges code the owner hasn't approved.

## Decision
1. **A PR opened from the owner's account is merged by the owner, on GitHub,** with their bypass of `main-approvals` ("Merge without waiting for requirements to be met", then "Rebase and merge"). `ci-ok` still has to pass: the `main` ruleset has no bypass. *(The owner's choice)*
2. **"merge #N" from the owner, for such a PR, starts `merge-pr`'s checks, not the merge.** The session looks for new comments, checks `ci-ok`, that the PR is mergeable and not a draft, then tells the owner it's ready to merge on GitHub, with the link. Once it sees the merge (woken by the app, or told), it restacks and cleans up as usual. *(Claude's choice, following the owner's choice in point 1)*
3. **In a stack,** the owner merges each such PR on GitHub from the bottom up, one at a time. After each merge the session restacks the next PR, waits for `ci-ok` on it, and asks for that one. It cleans up once the whole stack has merged. *(Claude's choice: `gh stack merge` runs as the App and can't merge them, and a restack makes `ci-ok` run again)*
4. **A session acting as the owner** (`gh auth status` shows `reznik-gev`, as on a machine not set up for the App) may still merge such a PR itself with `--admin`, as 0139 point 7 says. A session acting as the App never uses `--admin`. *(Claude's choice: 0139 point 7 still holds where it can work)*
5. **Sessions may still push review fixes to PRs from the owner's account.** Who pushed last doesn't change who can merge. *(Claude's choice, following point 1)*

## Consequences
- [`merge-pr`](../../.claude/skills/merge-pr/SKILL.md) steps 1 and 2, and [`prepare-pr-for-review`](../../.claude/skills/prepare-pr-for-review/SKILL.md) step 7 ("How to merge it"), say this.
- The [git guide](../guides/git.md) and [How a change is made](../guides/making-a-change.md) step 9 say who merges these PRs.
- No ruleset change.

## Updates
- *Update, 2026-11-11:* the owner named the approval ruleset `main-approvals` on GitHub, with a hyphen. This record's mentions of `main approvals` now use that name, with the owner's yes ([0126](0126-2026-11-08-what-may-change-in-an-accepted-record.md) point 4).
