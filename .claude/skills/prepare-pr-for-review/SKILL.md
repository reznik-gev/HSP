---
name: prepare-pr-for-review
description: Get an HSP pull request ready for the owner's review. Restack it, fix the review bot's comments, reply and resolve, ask the bot to look again (up to three bot rounds), bring the owner what needs their choice, then say it's ready. Use when the bot's review comes in, or the owner says "prepare #N for review" or "#N merged, get #M ready".
---

# Prepare a PR for the owner's review

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
- **Someone else's thread:** the owner or another person wrote in it. Don't reply or resolve. Bring it to the owner, and reply once they've answered.

## 4. Fix
- Fixes go in **new commits** named "Review on #N: …". Never amend or squash reviewed commits.
- A fix that makes or changes a decision needs a new record ([`record-decision`](../record-decision/SKILL.md)).
- Where a comment says a test is missing, add it, then check it fails when the code it covers is removed.
- Run the checks for every side the PR touches (CLAUDE.md), then push.

## 5. Reply and resolve
- Reply to every bot thread you fixed: what changed, and the commit's short hash. Then resolve it (`addPullRequestReviewThreadReply`, then `resolveReviewThread`).
- Leave disagreements, choices and other people's threads open until the owner answers. Then reply with the answer and what changed, and resolve it if it's the bot's.
- **Read every reply back from GitHub** ([how](../../../docs/guides/git.md#read-back-what-you-post)).

## 6. Ask the bot to look again
The bot's review when the PR opened or was marked ready is round 1. Count rounds by the bot's summary comments.
- If this round brought fixes that matter and fewer than three rounds have run, comment `@claude review` yourself, without asking, and read it back. The next round's comments wake this session (Auto-fix): go back to step 2. Don't poll.
- **Stop** after the third round, or sooner when a round brings only nitpicks or nothing new. Reply to nitpicks you didn't fix, saying why.

## 7. Report to the owner
One message. If the owner may be away, also send a short push notification:
- **Ready, or not:** the PR's link, whether it's mergeable, and whether CI passed.
- **What changed:** each bot comment and what you did about it. How many bot rounds ran, and why you stopped.
- **Checks:** which ran and passed, which you skipped and why, and what you couldn't check.
- **Questions:** each disagreement or choice, with your recommendation, one at a time. If there are none, say so.
- **How to merge it:** for a PR opened as the App, approving it on GitHub; for one opened with the owner's account, "merge #N" ([0137](../../../docs/decisions/0137-2026-11-10-a-github-app-for-claude-code-sessions.md)).
