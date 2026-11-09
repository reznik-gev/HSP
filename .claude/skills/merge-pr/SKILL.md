---
name: merge-pr
description: Merge an HSP pull request and clean up after it. Check for new comments, rebase-merge, restack the rest of the stack, update main, delete reservation branches and worktrees, name the follow-ups, then archive the session. Use when the owner says "merge #N", or says they merged #N, or the app reports that the session's PR merged. Also when a PR closes without merging, to clean up after it.
---

# Merge a pull request, and clean up

By default the owner says **"merge #N"** in the session, and the session merges. The owner may also approve or merge on GitHub. Then the session cleans up when it's woken by that, or when the owner says it merged ([0134](../../../docs/decisions/0134-2026-11-09-from-request-to-main.md)). The rules behind these steps are in [the git guide](../../../docs/guides/git.md) and [the stacked PRs guide](../../../docs/guides/stacked-prs.md). Do them in order, and say which one you're on.

## 1. Merged already, or yours to merge?
```bash
gh pr view N --json state,mergedAt,isDraft,mergeable,baseRefName,reviewDecision
```
If it's merged already, go to step 3. If it was **closed without merging**, do only the first two bullets of step 4: delete its `reserve/` branches, so its record numbers are free again, and its local branches and worktrees. Keep any memory of rules it meant to write down: they never reached a guide. Then report and archive (step 6). An approval alone isn't "merge": wait for the owner's word, unless the owner said otherwise for this PR.

## 2. Merge
- **Look at the comments again** (the query in [`prepare-pr-for-review`](../prepare-pr-for-review/SKILL.md), step 2, and `gh pr view N --comments`). If anything is new and unanswered, handle it first, and tell the owner why it didn't merge yet.
- `ci-ok` must pass, and the PR must be mergeable and not a draft. If not, say what's in the way.
- Merge with a rebase, never `--admin`:
  - A PR on its own: `gh pr merge N --rebase`.
  - In a stack: `gh stack merge N --rebase`. It also merges **every unmerged PR below N**. If any of them wasn't meant to merge now, stop and ask the owner.

## 3. Restack and update `main`
- If other PRs were stacked on this one, restack them: `gh stack sync --prune`, or by hand as the stacked PRs guide says. Force-pushing with `--force-with-lease` to restack needs no permission. If a conflict's answer isn't clear, stop and ask the owner.
- Fast-forward the main checkout's `main` to `origin/main` (`git -C <main checkout> merge --ff-only origin/main`), if it's on `main` and has no local changes. Otherwise leave it, and say so.

## 4. Clean up
- **Reservation branches:** for each decision record the PR added, delete its `reserve/decision-NNNN` branch:
  ```bash
  gh pr view N --json files --jq '.files[].path' | grep -E '^docs/decisions/[0-9]{4}-'
  git push origin --delete reserve/decision-NNNN
  ```
- **Branches and worktrees:** GitHub deletes the merged branch. Remove local branches and worktrees you made for this PR (`git worktree remove`, from the main checkout). Leave the session's own worktree to the app; archiving the session handles it.
- **Memory:** if the PR wrote into a guide a rule that was also in Claude's memory, delete that memory and its line in `MEMORY.md`. Rules live in the guides ([0134](../../../docs/decisions/0134-2026-11-09-from-request-to-main.md)). Update any memory about the state of the work that this merge changed.

## 5. Follow-ups
Look for work this PR left: points its records put off for later, bot or owner comments answered with "later", and anything you noticed along the way. Name each one to the owner. Propose each one that's a task of its own as a new session, following the app's rules for starting sessions.

## 6. Report, then archive
- One message: merged (by whom), the commit on `main`, what was restacked, what was cleaned up, and the follow-ups.
- Then archive this session, if it has nothing else in flight: no other open PR, no follow-up the owner wants done here, no question waiting.
