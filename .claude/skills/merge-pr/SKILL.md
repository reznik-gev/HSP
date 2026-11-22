---
name: merge-pr
description: Merge a Musical Chairs pull request and clean up after it. Check for new comments, rebase-merge, rebase the PRs built on it, update main, delete reservation branches and worktrees, name the follow-ups, then archive the session. Use when the owner says #N is approved and ready to merge, "merge #N" or "merge once CI passes", or says #N merged or closed, or the app reports that the session's PR merged or closed.
---

# Merge a pull request, and clean up

Do these steps in order, and say which one you're on.

## 1. Merged already, or yours to merge?
```bash
gh pr view N --json state,mergedAt,isDraft,mergeable,reviewDecision,author
```
- **Merged already:** go to step 3.
- **Closed without merging:** do only the first two bullets of step 4. Keep any memory of rules it meant to write down: they never reached a guide. Then step 6.
- **The owner said it's approved and ready to merge** (or "merge #N", or "merge once CI passes"): that's the go-ahead ([0142](../../../docs/decisions/0142-2026-11-11-no-auto-fix.md), [0153](../../../docs/decisions/0153-2026-11-22-when-sessions-use-github-auto-merge.md)). Don't merge on an approval the owner hasn't told you about.
  - **A PR opened as the App** (`author.login` is `app/reznik-gev-claude`): it also needs the owner's approval on GitHub (`reviewDecision` is `APPROVED`), since the App can't merge without it ([0137](../../../docs/decisions/0137-2026-11-10-a-github-app-for-claude-code-sessions.md)). If it's there, go to step 2. If not, ask the owner to approve it on GitHub.
  - **A PR opened with the owner's account:** go to step 2. If this session acts as the App (`gh auth status` shows `reznik-gev-claude[bot]`), the owner merges it, not you: see step 2 ([0143](../../../docs/decisions/0143-2026-11-11-the-owner-merges-their-own-prs.md)).
- Otherwise, wait for the owner's word.

## 2. Merge
Every PR merges on its own, never together with others. A PR built on another open PR can't merge until that one has: it's a draft, and CI's `builds-on-open-pr` job fails it, so `ci-ok` does too. Merge the one below first ([0154](../../../docs/decisions/0154-2026-11-22-prs-that-build-on-others-merge-one-at-a-time.md)).

**First, the checks:**
- **The bot's review is done.** If a Claude Code Review run on the PR is still going, wait for it to finish ([0153](../../../docs/decisions/0153-2026-11-22-when-sessions-use-github-auto-merge.md)). Look at the runs not yet `completed` in `gh run list --workflow claude-code-review.yml --json databaseId,status,event,headBranch,displayTitle`. A run from opening the PR shows the PR's head branch. A run from "@claude review" shows `main`, with the PR's title as `displayTitle`. `gh run watch <databaseId>` waits for one.
- **Look at the comments again** (the query in [`prepare-pr-for-review`](../prepare-pr-for-review/SKILL.md), step 2, and `gh pr view N --comments`). If anything is new and unanswered, handle it first, and tell the owner why it didn't merge yet.
- **Every review thread is resolved** (`isResolved` in that query). The `main-approvals` ruleset refuses the App's merges otherwise, and the owner's bypass skips that rule, so check it yourself. If one is open, tell the owner which. Ask them to resolve their own. Resolve a bot thread only as in [`prepare-pr-for-review`](../prepare-pr-for-review/SKILL.md) steps 5 and 6: a nitpick once you've replied why, a disagreement or choice only once the owner has answered.
- The PR is mergeable and not a draft. If not, say what's in the way.

**Then, a PR opened as the App** (approved on GitHub, step 1):
- **`ci-ok` passed:** merge with a rebase: `gh pr merge N --rebase`.
- **`ci-ok` still running:** turn on auto-merge instead of waiting ([0153](../../../docs/decisions/0153-2026-11-22-when-sessions-use-github-auto-merge.md)).
  - First bind the session to the PR, so its merge wakes you: `get_status`, then `bind_pr` if it doesn't report this PR.
  - `gh pr merge N --rebase --auto`. If GitHub refuses the App, use the app's `set_auto_merge` tool on the bound PR, with `merge_method: "rebase"` (its default is squash), or ask the owner to turn it on.
  - Check `gh pr view N --json state,autoMergeRequest`. If `ci-ok` had just passed, GitHub merged it at once: go to step 3. Otherwise tell the owner auto-merge is on, then wait. Once you're woken by the merge, or told, go to step 3.
- **While auto-merge is on:** before any push to the PR, a CI fix included, turn auto-merge off (`gh pr merge N --disable-auto`) and ask the owner for the go-ahead again: GitHub would merge the push unseen. A rebase onto `main` with no conflict is the one exception, since it replays the same commits. One that needed a conflict fixed is a push like any other. The same goes for a new comment you hear of: turn auto-merge off, handle it, and ask again. A new review thread stops GitHub merging on its own; a plain PR comment doesn't.
- **`ci-ok` failed:** say so, and wait for the owner.
- Never turn on auto-merge without the owner's go-ahead in the session.

**Or, a PR opened with the owner's account.** Never auto-merge it: it would wait forever on an approval the owner can't give. Wait for `ci-ok` to pass first (`gh pr checks N --watch --required`), then run the checks above again, since comments may have come in during the wait. If `ci-ok` fails, say so, and wait for the owner.
- **While this session acts as the App:** don't merge it. The owner can't approve their own PR, and the App has no bypass, so GitHub refuses it, `--admin` too. Tell the owner it's ready: the link, and to merge it on GitHub with "Merge without waiting for requirements to be met", then "Rebase and merge". Then wait: once you're woken by the merge, or told, go to step 3 ([0143](../../../docs/decisions/0143-2026-11-11-the-owner-merges-their-own-prs.md)).
- **While this session acts as the owner** (`gh auth status` shows `reznik-gev`): merge with a rebase, as for an App PR above. Add `--admin` only when GitHub refuses the merge for want of an approval: it uses the owner's bypass of the `main-approvals` ruleset, and the `main` ruleset still requires `ci-ok` ([0139](../../../docs/decisions/0139-2026-11-10-how-sessions-get-the-apps-tokens.md)). **Never `--admin` while acting as the App.**

## 3. Rebase the PRs built on this one, and update `main`
- **Find the open PRs built on #N:** those that hold its head commit.
  ```bash
  head=$(gh pr view N --json headRefOid --jq .headRefOid)
  git fetch -q origin '+refs/pull/*/head:refs/remotes/pull/*'
  for p in $(gh pr list --state open --json number --jq '.[].number'); do
    git merge-base --is-ancestor "$head" "refs/remotes/pull/$p" && echo "#$p"
  done
  ```
- **Rebase each one onto `main`**, push with `--force-with-lease`, and mark it ready (`gh pr ready <PR>`), as in [the guide](../../../docs/guides/stacked-prs.md#when-x-merges-rebase-y). The push runs its CI again, and `builds-on-open-pr` passes once no other open PR is below it. Leave it a draft if another PR below it is still open, or if the owner must check it first. If another session opened it, tell the owner instead, so that session does it. If a conflict's answer isn't clear, stop and ask the owner ([0154](../../../docs/decisions/0154-2026-11-22-prs-that-build-on-others-merge-one-at-a-time.md)).
- Fast-forward the main checkout's `main` (`git -C <main checkout> merge --ff-only origin/main`), if it's on `main` with no local changes. Otherwise say so.

## 4. Clean up
- **Reservation branches:** delete `reserve/decision-NNNN` for each record the PR added:
  ```bash
  gh pr view N --json files --jq '.files[].path' | grep -E '^docs/decisions/[0-9]{4}-'
  git push origin --delete reserve/decision-NNNN
  ```
- **Branches and worktrees:** remove local branches, and worktrees you made with `git worktree add` (`git worktree remove`, from the main checkout), but never the demo's, `.claude/worktrees/demo` ([`run-demo`](../run-demo/SKILL.md)). Leave the worktree the app made for the session: archiving removes it.
- **Memory:** delete any memory whose rule the PR wrote into a guide, and its line in `MEMORY.md`. Update any memory about the state of the work that this merge changed.

## 5. Follow-ups
Look for work the PR left: points its records put off, comments answered with "later", and anything you noticed. Name each one to the owner, and propose each task of its own as a new session.

## 6. Report, then archive
- One message: merged (by whom), the commit on `main`, which PRs built on it were rebased and marked ready, what was cleaned up, and the follow-ups.
- Then archive this session, if nothing else is in flight: no other open PR, no follow-up to do here, no question waiting.
