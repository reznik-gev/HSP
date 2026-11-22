# 0153 — A session turns on auto-merge when the owner's go-ahead comes before CI has passed

- **Date:** 2026-11-22
- **Status:** Accepted
- **Refines:** [0137](0137-2026-11-10-a-github-app-for-claude-code-sessions.md) (the "to consider later" GitHub auto-merge; setup step 6: approval of the most recent push), [0139](0139-2026-11-10-how-sessions-get-the-apps-tokens.md) (the "to consider later" GitHub auto-merge), [0142](0142-2026-11-11-no-auto-fix.md) (point 6: the go-ahead to merge, and the session merging itself)

## Context
[0137](0137-2026-11-10-a-github-app-for-claude-code-sessions.md) and [0139](0139-2026-11-10-how-sessions-get-the-apps-tokens.md) left GitHub auto-merge to consider later. Auto-merge is GitHub's switch on a PR: once its required checks pass, GitHub merges it on its own. 0137 set it aside because it skips [`merge-pr`](../../.claude/skills/merge-pr/SKILL.md)'s last look at new comments, and because `ci-ok` wasn't a required check yet. `ci-ok` is required again on `main` today.

On 2026-11-22 the owner ticked "Allow auto-merge" in the repository's settings. On [#190](https://github.com/reznik-gev/MusicalChairs/pull/190) the owner said "once CI passes, merge", and auto-merge with the rebase method merged it. No record or skill said when a session may do this.

Two things make it different from a session merging itself:
- **Nothing looks at the comments right before the merge.** Without Auto-fix ([0142](0142-2026-11-11-no-auto-fix.md)), a new comment doesn't wake the session, so it can't look again when GitHub merges.
- **Auto-merge waits for every requirement,** the approval too. A PR opened with the owner's account can't get one ([0143](0143-2026-11-11-the-owner-merges-their-own-prs.md)), so auto-merge would never merge it.

## Options considered
When a session turns on auto-merge:
- **When the owner's go-ahead comes and `ci-ok` hasn't passed yet** ✅. The owner's word still starts every merge, as in 0142. Auto-merge only saves the wait for CI. If CI has already passed, the session merges as before.
- Only when the owner asks for it ("auto-merge #N"). A plain "merge #N" with CI still running would mean the session waits. Safer, but the owner has to remember a second phrase for the same wish.
- For every PR the owner approves on GitHub, without the owner's word in the session. Fastest, but it undoes 0142 point 6.

How the last look at comments still holds:
- **The session looks at the comments right before it turns auto-merge on, and GitHub refuses to merge while a review thread is unresolved** ✅. The owner ticks "Require conversation resolution before merging" in the `main-approvals` ruleset. A new thread in the wait for CI then stops the merge without anyone watching.
- The session's look at turn-on is the last look, and the owner turns auto-merge off by hand if a new comment should stop it. Simpler, but a thread that comes in during the wait merges unseen unless the owner catches it.
- Sessions never turn on auto-merge, since the last look must be right before the merge itself. Safest, but the owner's wish on #190 would need the session to wait for CI every time.

Whether `main-approvals` still requires approval of the most recent push ([0137](0137-2026-11-10-a-github-app-for-claude-code-sessions.md) setup step 6):
- **Turn it off** ✅. In two days of use, the owner almost always approved again after any push that followed their first approval. Requiring resolved threads covers the same need better: a push that answers a comment can't merge until the thread is resolved.
- Keep it. Every push after an approval needs another one, which the owner gave almost every time anyway.

## Decision
1. **A session turns on auto-merge when the owner's go-ahead comes before `ci-ok` has passed:** "merge #N", "merge once CI passes", or the PR is approved and ready to merge. If `ci-ok` has already passed, the session merges itself, as before. It never turns on auto-merge without the owner's word in the session. *(The owner's choice)*
2. **Only for a PR that needs nothing but CI:** opened as the App, and already approved by the owner on GitHub. A PR opened with the owner's account can't get that approval, so it goes as [0143](0143-2026-11-11-the-owner-merges-their-own-prs.md) says. *(Claude's choice: auto-merge would wait forever on the approval)*
3. **Always the rebase method** ([0069](0069-2026-10-08-rebase-merges.md)): `gh pr merge N --rebase --auto`. If the session uses the app's `set_auto_merge` tool instead, it passes `merge_method: "rebase"`, since that tool's default is squash. *(Claude's choice)*
4. **The session looks at the comments right before it turns auto-merge on,** as before a merge. If anything is new and unanswered, it handles it first and doesn't turn auto-merge on. *(The owner's choice)*
5. **GitHub refuses a merge while a review thread is unresolved.** The owner ticks "Require conversation resolution before merging" in the `main-approvals` ruleset; the App can't change repository settings. This holds for every merge, not only auto-merge. *(The owner's choice)*
6. **If a new comment comes in during the wait** and the session hears of it (the owner tells it), it turns auto-merge off (`gh pr merge N --disable-auto`), handles the comment, and asks the owner for the go-ahead again. A plain PR comment, outside a review thread, doesn't stop GitHub: the owner turns auto-merge off on GitHub if it should. *(The owner's choice)*
7. **In a stack, only the bottom PR gets auto-merge.** After it merges, the session restacks, and starts the next PR's merge again, auto-merge included if `ci-ok` is still running. *(Claude's choice: the PR above is out of date until it's restacked)*
8. **After turning auto-merge on, the session reports** that auto-merge is on and waits. Once it's woken by the merge, or told, it cleans up as after any merge. *(Claude's choice)*
9. **`main-approvals` no longer requires approval of the most recent push.** An approval stays valid after a later push. The go-ahead to merge is still the owner's word in the session. The owner turned the setting off on 2026-11-22. *(The owner's choice)*

## Consequences
- [`merge-pr`](../../.claude/skills/merge-pr/SKILL.md) step 2, the [git guide](../guides/git.md#merging) and [How a change is made](../guides/making-a-change.md) step 9 change to match. [`open-pr`](../../.claude/skills/open-pr/SKILL.md) step 5 says so, and keeps leaving auto-merge to `merge-pr`.
- With conversation resolution required, every open review thread must be resolved before a merge. The owner resolves their own threads ([0142](0142-2026-11-11-no-auto-fix.md) point 4), and a disagreement thread of the bot's is resolved once the owner has answered it.
- [0137](0137-2026-11-10-a-github-app-for-claude-code-sessions.md) setup step 6 no longer ticks "Require approval of the most recent reviewable push", for this or a future project.
- **The owner's step:** tick "Require conversation resolution before merging" in the `main-approvals` ruleset. Done on 2026-11-22, before this record merged; checked in the ruleset the same day.
- Not yet checked: whether the App's token may turn on auto-merge. On #190 the owner's account turned it on. If GitHub refuses the App, the session uses the app's `set_auto_merge` tool, or asks the owner to turn it on.
