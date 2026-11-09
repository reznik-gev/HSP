---
name: prepare-pr-for-review
description: Get an HSP pull request ready for the owner's review. Restack it, handle the review bot's comments, reply and resolve, ask the bot to look again (up to three bot rounds), ask the owner what needs their choice, then say it's ready. Use when the bot's review comes in (Auto-fix wakes the session for it), or the owner says "prepare #N for review", "#N merged, get #M ready", or "restack #N and fix the bot's review".
---

# Prepare a PR for the owner's review

The owner reviews a PR only once it's up to date and the review bot's comments are dealt with, over at most three bot rounds ([0134](../../../docs/decisions/0134-2026-11-09-from-request-to-main.md)). Do these steps in order, and say which one you're on as you go. The rules behind them are in [the git guide](../../../docs/guides/git.md) and [the stacked PRs guide](../../../docs/guides/stacked-prs.md).

## 1. Restack
Bring the PR up to date with `main`. Usually the PR below it just merged, so the branch still carries old copies of that PR's commits.
- Work in a separate worktree, not the main checkout. The main checkout may be serving a demo, and its branch shouldn't change under it.
- Fetch first. If the PR is part of a GitHub stack, run `gh stack sync --prune`. Otherwise, follow "Doing it by hand" in the stacked PRs guide.
- If a conflict comes up, resolve it when the right answer is clear (see "When there is a real conflict" in the stacked PRs guide). If it isn't clear, stop and ask the owner.
- Force-pushing with `--force-with-lease` to restack is expected and needs no permission. Don't force-push for any other reason.
- Also fast-forward the main checkout's `main` to `origin/main`, if it has no local changes.

## 2. Read the review comments
Read every unresolved review thread and every PR comment, with the author of each. GitHub's GraphQL API gives the threads with their ids:
```bash
gh api graphql -f query='query{repository(owner:"reznik-gev",name:"HSP"){pullRequest(number:N){reviewThreads(first:50){nodes{id isResolved path line comments(first:20){nodes{author{login} body}}}}}}}'
```
The review bot's login is `github-actions`. Treat a thread as the bot's only if every comment in it is the bot's.

## 3. Sort each comment
For each thread, decide which kind it is:
- **A fix:** the bot is right, and the change is clear. Make it.
- **A disagreement:** the bot is wrong, or its fix would break something or go against a decision record. Don't change the code. Explain why to the owner in step 7.
- **A choice:** the comment raises a question about scope, order or behaviour users notice, which is the owner's to decide (CLAUDE.md, "Working with the product owner"). **A fix that would change behaviour users notice is always a choice**, even when the bot is right. Bring the options, their trade-offs and a recommendation to the owner, one question at a time. Small UI details you're confident about you may decide yourself, but record them as *(Claude's choice)* in a decision record.
- **Someone else's thread:** the owner or another person wrote in it. Don't reply or resolve yet. Bring it to the owner, and reply once they've answered, as the git guide asks for every comment.

## 4. Fix
- Fixes go in **new commits** on top of the PR, named "Review on #N: …". Never amend or squash reviewed commits.
- A fix that makes or changes a decision needs a new decision record. Accepted records stay frozen: only their status, a `Refined by:` line, a dated note added at the end, or a rename the owner approved may change ([0126](../../../docs/decisions/0126-2026-11-08-what-may-change-in-an-accepted-record.md)). Write it with [`record-decision`](../record-decision/SKILL.md), which claims its number so parallel sessions don't clash.
- Where a comment says a test is missing, add the test, then check it fails when the code it covers is removed.
- Run the checks for every side the PR touches, as CLAUDE.md lists them, before pushing. DB tests need the dev stack running and `HSP_TEST_DATABASE_URL` set (see [backend/README.md](../../../backend/README.md)). If a check fails for a reason that isn't this PR's, check whether it also fails on `main`, and say so. Don't push anything that fails because of this PR.
- Push.

## 5. Reply and resolve
- Reply to every bot thread you fixed: what changed, and the commit's short hash. Then resolve it (`addPullRequestReviewThreadReply`, then `resolveReviewThread`).
- Leave disagreements, choices and other people's threads open until the owner answers. Then reply to each with the answer and what changed, and resolve it if it's the bot's.
- **Read every reply back from GitHub** before reporting, as [the git guide](../../../docs/guides/git.md#read-back-what-you-post) says.

## 6. Ask the bot to look again
The bot's review when the PR opened (or was marked ready) is round 1. Count the rounds by the bot's summary comments on the PR.
- If this round brought fixes that matter, and fewer than three rounds have run, comment `@claude review` on the PR, and read it back. Don't report to the owner yet: the next round's comments wake this session (Auto-fix), and you go back to step 2. Don't poll for the review.
- **Stop** after the third round, or sooner when a round brings only nitpicks or nothing new. Nitpicks you didn't fix get a reply saying why, like any other comment.
- A comment that asks the bot to look again is yours to post; you don't need to ask the owner ([0134](../../../docs/decisions/0134-2026-11-09-from-request-to-main.md)).

## 7. Report to the owner
End with one message. If the owner may be away, also send a short push notification that it's ready:
- **Ready, or not:** whether the PR is ready for review, with its link, whether it's mergeable, and whether CI is running or passed.
- **What changed:** each bot comment, and what you did about it. How many bot rounds ran, and why you stopped.
- **Checks:** which ones ran and passed, which you skipped and why, and anything you couldn't check (for example, how a change looks on screen).
- **Questions:** each disagreement or choice, with your recommendation, one at a time. If there are none, say so.
