---
name: prepare-pr-for-review
description: Get an HSP pull request ready for the owner's review. Restack it, fix the review bot's and the owner's comments, reply and resolve, ask the bot to look again, bring the owner what needs their choice, then say it's ready and stop. Each round starts on the owner's word. Use when the owner says the bot or they left comments on #N, "prepare #N for review", or "#N merged, get #M ready".
---

# Prepare a PR for the owner's review

Each round starts when the owner says so: the bot or the owner left comments, or "prepare #N". Auto-fix is off, so nothing else starts one ([0142](../../../docs/decisions/0142-2026-11-11-no-auto-fix.md)). There are as many rounds as the owner wants.

Do these steps in order, and say which one you're on.

## 1. Restack
Bring the PR up to date with `main`. Usually the PR below it just merged.
- Work in a separate worktree, not the main checkout: it may be serving a demo.
- Fetch first. In a GitHub stack, run `gh stack sync --prune`. Otherwise follow "Doing it by hand" in [the stacked PRs guide](../../../docs/guides/stacked-prs.md).
- Resolve a conflict when the right answer is clear ("When there is a real conflict" in the same guide). If it isn't, stop and ask the owner.
- Force-push with `--force-with-lease` to restack, without asking. Never force-push for any other reason.
- Fast-forward the main checkout's `main` to `origin/main`, if it has no local changes.

## 2. Read the review comments
Read every unresolved review thread and every PR comment, with the author of each:
```bash
gh api graphql -f query='query{repository(owner:"reznik-gev",name:"HSP"){pullRequest(number:N){reviewThreads(first:50){nodes{id isResolved path line comments(first:20){nodes{author{login} body}}}}}}}'
```
The review bot's login is `github-actions`. A thread is the bot's only if every comment in it is the bot's.

## 3. Sort each comment
- **A fix:** the bot is right, and the change is clear. Make it.
- **A disagreement:** the bot is wrong, or its fix would break something or go against a record. Don't change the code. Explain why to the owner in step 7.
- **A choice:** scope, order or behaviour users notice. **A fix that would change behaviour users notice is always a choice**, even when the bot is right. Bring it to the owner, one question at a time.
- **The owner's comment:** the owner asked for this round, so sort it like the bot's: a fix, a disagreement or a choice. If it's unclear, ask. Reply when you've fixed it, but leave resolving it to the owner.
- **Someone else's thread:** another person wrote in it. Don't reply or resolve. Bring it to the owner, and reply once they've answered.

## 4. Fix
- Fixes go in **new commits** named "Review on #N: …". Never amend or squash reviewed commits.
- A fix that makes or changes a decision needs a new record ([`record-decision`](../record-decision/SKILL.md)).
- Where a comment says a test is missing, add it, then check it fails when the code it covers is removed.
- Run the checks for every side the PR touches (CLAUDE.md), then push.

## 5. Reply and resolve
- Reply to every bot thread you fixed: what changed, and the commit's short hash. Then resolve it (`addPullRequestReviewThreadReply`, then `resolveReviewThread`).
- Reply to every thread of the owner's you fixed the same way, but don't resolve it.
- Leave disagreements, choices and other people's threads open until the owner answers. Then reply with the answer and what changed, and resolve it if it's the bot's.
- **Read every reply back from GitHub** ([how](../../../docs/guides/git.md#read-back-what-you-post)).

## 6. Ask the bot to look again
- If this round changed code or docs, comment `@claude review` yourself, without asking, and read it back. There's no limit on rounds: the owner decides when to stop.
- Reply to nitpicks you didn't fix, saying why.
- Then report (step 7), with CI's state on this round's push, and **stop**. Don't poll, and don't wait for the bot. Go back to step 2 when the owner starts the next round.

## 7. Report to the owner
One message. If the owner may be away, also send a short push notification:
- **Ready, or not:** the PR's link, whether it's mergeable, and how CI did on your latest push: running, passed or failed. Auto-fix is off, so this is how the owner hears about CI ([0142](../../../docs/decisions/0142-2026-11-11-no-auto-fix.md) point 5).
- **What changed:** each comment, the bot's and the owner's, and what you did about it. Whether you asked the bot to look again.
- **Checks:** which ran and passed, which you skipped and why, and what you couldn't check.
- **Questions:** each disagreement or choice, with your recommendation, one at a time. If there are none, say so.
- **What's next:** the owner says when there are new comments to address. When it's done, the owner tells the session it's approved and ready to merge ([0142](../../../docs/decisions/0142-2026-11-11-no-auto-fix.md)). A PR opened as the App needs the owner's approval on GitHub first ([0137](../../../docs/decisions/0137-2026-11-10-a-github-app-for-claude-code-sessions.md)). For one opened with the owner's account, the session does its last checks. If this session acts as the App, the owner then merges it on GitHub: "Merge without waiting for requirements to be met", then "Rebase and merge". A session acting as the owner merges it itself ([0143](../../../docs/decisions/0143-2026-11-11-the-owner-merges-their-own-prs.md)).
