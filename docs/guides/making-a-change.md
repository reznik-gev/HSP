# How a change is made

The usual path of a change made in a Claude Code session, from the owner's request to the cleanup after merging ([0134](../decisions/0134-2026-11-09-from-request-to-main.md)). Each step names the skill that does it. The Git and GitHub rules behind the steps are in [Working with Git and pull requests](git.md) and [Working with stacked pull requests](stacked-prs.md). Part of the [guides](README.md).

## The steps

1. **The request.** The owner asks for a change.
2. **What "done" means.** Ask the owner what done looks like, unless the request already says. For a small fix whose outcome is plain, state your own definition of done and go on.
3. **Questions.** Scope, order and behaviour users notice go to the owner, one at a time ([CLAUDE.md](../../CLAUDE.md)). Small details you're sure about, decide yourself and mark *(Claude's choice)*.
4. **The decision record:** [`record-decision`](../../.claude/skills/record-decision/SKILL.md). It claims the record's number first, so parallel sessions don't clash.
5. **Building and testing**, in a worktree, with the checks CLAUDE.md lists.
6. **Opening the PR:** [`open-pr`](../../.claude/skills/open-pr/SKILL.md). Push and open it without asking. If the owner must check something first, open it as a draft and say what to check. For something on screen, bring up the demo on the PR with [`run-demo`](../../.claude/skills/run-demo/SKILL.md). Turn on Auto-fix only for a PR opened with the owner's account: the app refuses it for PRs opened as the App, and the owner wants to start each review round of those ([0142](../decisions/0142-2026-11-11-no-auto-fix-for-app-prs.md)).
7. **Bot rounds:** [`prepare-pr-for-review`](../../.claude/skills/prepare-pr-for-review/SKILL.md). Fix each round of the review bot's comments, then ask it to look again, up to three bot rounds in all. For a PR opened as the App, each round starts when the owner says "prepare #N", and the owner tells the session if CI fails.
8. **The owner's review.** Tell the owner it's ready. More rounds with the owner may follow.
9. **Merging and cleanup:** [`merge-pr`](../../.claude/skills/merge-pr/SKILL.md). Sessions on a machine set up for the owner's GitHub App open PRs as `reznik-gev-claude[bot]` ([0137](../decisions/0137-2026-11-10-a-github-app-for-claude-code-sessions.md), [0139](../decisions/0139-2026-11-10-how-sessions-get-the-apps-tokens.md)). For those, the owner's **approval on GitHub** is the go-ahead to merge. PRs opened with the owner's own account, from a cloud session or a machine not set up for the App, can't be approved by the owner: for those the owner says "merge #N" and the session does its last checks. A session acting as the App then asks the owner to merge it on GitHub with their bypass. A session acting as the owner may merge it itself with `--admin` ([0143](../decisions/0143-2026-11-11-the-owner-merges-their-own-prs.md)). If the owner merged on GitHub, clean up once you're woken by it or told.

## Where the rules live
Rules for working on HSP go in the guides and skills, not in one machine's Claude memory. Every session reads them, on any machine or in the cloud, and so does the review bot. A change to them goes through a PR, so the owner sees it. Claude's memory keeps only the state of the work, and a new rule until the PR that writes it into a guide merges.
