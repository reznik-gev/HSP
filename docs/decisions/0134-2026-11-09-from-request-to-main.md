# 0134 — How a change goes from a request to `main`

- **Date:** 2026-11-09
- **Status:** Accepted
- **Refines:** [0101](0101-2026-10-19-claude-reviews-only.md) (who asks the review bot to look again)

## Context
Most HSP work follows the same path. The owner asks for a change. A Claude Code session works out what's needed, asks the owner what's theirs to decide, builds it and tests it. Then it opens a PR, the review bot reviews it, the session fixes the review, and the owner reviews and merges.

On 2026-11-09 the owner and Claude went over this path. Some steps were written down only in Claude's memory on one machine, not in the guides. Others weren't written down anywhere, so each session guessed:
- **Re-reviews.** The [git guide](../guides/git.md) said to comment `@claude review` after review fixes. The owner meant that as a step for the owner, but sessions began doing it unasked.
- **Opening the PR.** Sessions sometimes asked before pushing, and sometimes didn't.
- **Auto-fix.** The owner always says yes when a session offers to turn it on.
- **Merging and cleanup.** Sometimes the owner merges and sometimes a session does. After a merge, nobody owned restacking, updating `main` and archiving the session.
- **Record numbers.** Sessions running at the same time pick the same next number, and one has to renumber (#149 renumbered its record to 0130). A shared file of reserved numbers on `main` can't be written directly: the `main` ruleset requires a PR and passing CI, with no bypass.

## Options considered
Who asks the bot to review again after fixes:
- **The session, up to three bot rounds in all** ✅. It stops earlier when a round brings only nitpicks or nothing.
- The session asks the owner before each new round.
- One bot round only; the owner asks for more.

How a session claims a record number:
- **A reservation branch on GitHub** ✅. Pushing an empty commit to `reserve/decision-NNNN` fails if another session already holds that name, so two sessions can't both claim it, cloud sessions included. No CI runs on these branches.
- A claim merged into `main` through a small PR: a line in a reserved-numbers file, or the record's row in the index marked "Reserved". The claim would be in `main`'s history, and abandoned numbers would stay explained. The owner weighed it on 2026-11-09 and set it aside, for two main reasons. **Each claim would cost 1–2 minutes** for a PR, CI and a merge, against an instant push. And **a session would need an exception to put changes on `main` by itself**, which the owner doesn't want. The review bot would also have to skip these PRs.
- Checking `main`, the open PRs and local worktrees, then opening a draft PR at once. Simplest, but two sessions in the same minute can still clash.

When a change needs the owner's eyes before review:
- **Open it as a draft PR, with what to check** ✅. The bot doesn't review drafts, so no round is spent on something the owner may change.
- Always open it ready for review.
- Stop before pushing and ask.

How a merge happens:
- **The owner says "merge #N" in the session** ✅, and the session merges and cleans up. An approval on GitHub counts the same as "merge #N". The owner may also merge on GitHub. Then the session cleans up when GitHub's notice wakes it, or when the owner says it merged.
- GitHub auto-merge once the owner approves.
- The owner always merges on GitHub.

## Decision
The owner's choices are the four marked above. Together with the rules already in the guides, the path is:

1. **The request.** The owner asks for a change.
2. **What "done" means.** Before building, the session asks the owner what done looks like, unless the request already says. *(The owner's choice)* For a small fix whose outcome is plain from the request, the session states its own definition of done and goes on. *(Claude's choice)*
3. **Questions.** Scope, order and behaviour users notice go to the owner, one at a time, with options and a recommendation ([CLAUDE.md](../../CLAUDE.md)). **A review fix that changes behaviour users notice is a question too**, never a quiet fix. *(The owner's choice)* Small details the session is sure about, it decides itself and marks *(Claude's choice)* in the record.
4. **The decision record**, with a number claimed by a reservation branch (below).
5. **Building and testing**, with the checks CLAUDE.md lists for each side changed, and a CHANGELOG line when users or operators notice the change.
6. **Opening the PR.** The session pushes and opens the PR **without asking**. *(The owner's choice)* If the owner must check something first, such as how a change looks or feels, the PR opens as a **draft**. Its description says exactly what to check, and the session shows the owner screenshots from the browser pane where they help. *(Claude's choice: `gh` can't upload images to a PR description)* Once the owner OKs it, the session marks it ready.
7. **Auto-fix** is turned on for every PR the session opens, without asking. *(The owner's choice)*
8. **Bot rounds.** The bot reviews the PR when it opens or is marked ready. The session fixes each round (the [`prepare-pr-for-review`](../../.claude/skills/prepare-pr-for-review/SKILL.md) skill), then comments `@claude review` itself, **up to three bot rounds in all**. *(The owner's choice)* It stops earlier when a round brings only nitpicks or nothing new. *(Claude's choice)*
9. **The owner's review.** The session tells the owner the PR is ready, with a push notification when the owner may be away. There may be more rounds with the owner.
10. **Merging.** By default the owner says **"merge #N"** in the session, and the session merges. **An approval on GitHub counts the same as "merge #N"**, unless the owner says on the PR or in the session not to merge yet. The owner may also merge on GitHub. If the approval or the merge wakes the session, it goes on to merging or the cleanup. Otherwise the owner tells it. *(The owner's choice)*
11. **Cleanup and follow-ups.** The session restacks the rest of the stack, fast-forwards the main checkout's `main`, deletes the PR's `reserve/` branches, and removes any worktrees it made for the PR with `git worktree add`. It names any follow-up work, then archives the session if nothing is left in it. Archiving removes the worktree the app made for the session. *(Claude's choice: a session never removes the worktree it runs in)*

### Claiming a record number
- The session finds the highest number on `main`, in the open PRs and on `reserve/decision-*` branches, and takes the next one.
- It pushes an empty commit on top of `origin/main` to `reserve/decision-NNNN`. The commit message says what the record is about and which branch it's for. *(Claude's choice)* Each commit is new, so a second session's push is not a fast-forward and GitHub refuses it. Checked on 2026-11-09. If the push is refused, the session takes the next number. **It never force-pushes a `reserve/` branch.**
- **No workflow runs on `reserve/` branches.** Today every workflow starts on a PR, a push to `main`, a `v*` tag, a schedule or by hand, so nothing does. A workflow added later that runs on pushes to other branches must skip `reserve/**` (`branches-ignore`). *(Claude's choice)*
- After the PR merges or closes, the `reserve/` branches for its records are deleted.

### Where the rules live
Rules for working on HSP go in the guides and skills, not in one machine's Claude memory. *(The owner's choice)* The guides are read by every session, on any machine or in the cloud, and by the review bot. A change to them goes through a PR, so the owner sees it. Claude's memory keeps only:
- what isn't a rule about the repository, such as the state of the work on a given day;
- a new rule, until the PR that writes it into a guide merges.

## Consequences
- New skills: [`record-decision`](../../.claude/skills/record-decision/SKILL.md), [`open-pr`](../../.claude/skills/open-pr/SKILL.md) and [`merge-pr`](../../.claude/skills/merge-pr/SKILL.md). [`prepare-pr-for-review`](../../.claude/skills/prepare-pr-for-review/SKILL.md) gets the bot-round limit.
- A new guide, [How a change is made](../guides/making-a-change.md), gets the whole path. *(The owner's choice: it's a path of work, and only partly about Git)* The [git guide](../guides/git.md) takes over three rules that until now were only in Claude's memory: force-push only to rebase, which review threads a session may resolve, and reading back what it posted on GitHub.
- Open PRs from before this record (0131–0133) have no reservation branches. Checking the open PRs covers them.
- The owner's review stays the only review from outside Claude, since the review bot is Claude too. The owner accepted this for now: HSP's users can ask for changes later.
