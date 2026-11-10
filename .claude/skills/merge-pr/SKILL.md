---
name: merge-pr
description: Merge an HSP pull request and clean up after it. Check for new comments, rebase-merge, restack, update main, delete reservation branches and worktrees, name the follow-ups, then archive the session. Use when the owner says "merge #N", approves #N on GitHub, or says #N merged or closed, or the app reports that the session's PR merged or closed.
---

# Merge a pull request, and clean up

Do these steps in order, and say which one you're on.

## 1. Merged already, or yours to merge?
```bash
gh pr view N --json state,mergedAt,isDraft,mergeable,reviewDecision
```
- **Merged already:** go to step 3.
- **Closed without merging:** do only the first two bullets of step 4. Keep any memory of rules it meant to write down: they never reached a guide. Then step 6.
- **The owner said "merge #N", or approved it on GitHub:** go to step 2, unless the owner said not to merge yet.
- Otherwise, wait for the owner's word.

## 2. Merge
- **Look at the comments again** (the query in [`prepare-pr-for-review`](../prepare-pr-for-review/SKILL.md), step 2, and `gh pr view N --comments`). If anything is new and unanswered, handle it first, and tell the owner why it didn't merge yet.
- `ci-ok` must pass, and the PR must be mergeable and not a draft. If not, say what's in the way.
- Merge with a rebase, never `--admin`:
  - A PR on its own: `gh pr merge N --rebase`.
  - In a stack: `gh stack merge N --rebase`. It also merges **every unmerged PR below N**. If any of them wasn't meant to merge now, stop and ask the owner.

## 3. Restack and update `main`
- Restack any PRs stacked on this one: `gh stack sync --prune`, or by hand ([the stacked PRs guide](../../../docs/guides/stacked-prs.md)). If a conflict's answer isn't clear, stop and ask the owner.
- Fast-forward the main checkout's `main` (`git -C <main checkout> merge --ff-only origin/main`), if it's on `main` with no local changes. Otherwise say so.

## 4. Clean up
- **Reservation branches:** delete `reserve/decision-NNNN` for each record the PR added:
  ```bash
  gh pr view N --json files --jq '.files[].path' | grep -E '^docs/decisions/[0-9]{4}-'
  git push origin --delete reserve/decision-NNNN
  ```
- **Branches and worktrees:** remove local branches, and worktrees you made with `git worktree add` (`git worktree remove`, from the main checkout). Leave the worktree the app made for the session: archiving removes it.
- **Memory:** delete any memory whose rule the PR wrote into a guide, and its line in `MEMORY.md`. Update any memory about the state of the work that this merge changed.

## 5. Follow-ups
Look for work the PR left: points its records put off, comments answered with "later", and anything you noticed. Name each one to the owner, and propose each task of its own as a new session.

## 6. Report, then archive
- One message: merged (by whom), the commit on `main`, what was restacked and cleaned up, and the follow-ups.
- Then archive this session, if nothing else is in flight: no other open PR, no follow-up to do here, no question waiting.
