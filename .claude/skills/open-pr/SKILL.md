---
name: open-pr
description: Take finished HSP work to an open pull request. Run the checks, add the CHANGELOG line, push and open the PR without asking (a draft when the owner must check something first), and turn on Auto-fix for a PR opened with the owner's account. Use when a change is built and tested, or the owner says "open a PR" or "push it".
---

# Open a pull request

Don't ask the owner before opening it. Do these steps in order, and say which one you're on.

## 1. Is it ready to go up?
- Every decision it makes is in a record ([`record-decision`](../record-decision/SKILL.md)), and the owner has answered every question that's theirs.
- The change meets its definition of done: the owner's, or the one you stated.

## 2. Run the checks
- Run the checks for each side the branch changes (CLAUDE.md). DB tests need the dev stack running and `HSP_TEST_DATABASE_URL` set ([backend/README.md](../../../backend/README.md)).
- If a check fails for a reason that isn't this branch's, check whether it also fails on `main`, and say so in the PR.
- If the change shows on screen, look at it in the browser pane: both languages, and a narrow width if layout changed. Keep screenshots of what the owner will want to see. For a draft the owner will check by hand, do it in the demo with [`run-demo`](../run-demo/SKILL.md) once the PR is open.

## 3. The CHANGELOG
If users or operators notice the change, add a line under `## [Unreleased]` in `CHANGELOG.md` ([how](../../../docs/guides/releasing.md#between-releases-keep-the-changelog)).

## 4. Push and open
- Bring the branch up to date with `origin/main` (or the PR below it, in a stack).
- **Ready or draft?** A **draft** if the owner must check something first: how it looks or feels, or a choice you couldn't settle. The bot doesn't review drafts, so no round is spent on what the owner may change. Otherwise, ready.
- Open it with `gh pr create` (`--draft` for a draft), or `gh stack submit` in a stack. The description:
  ```markdown
  ## What changes
  For the user or operator, in plain words.

  ## How it's built
  The main parts, and anything a reviewer should read first.

  ## Decisions
  The records it adds or follows. List each *(Claude's choice)* point.

  ## Done means
  The definition of done, and how the change meets it.

  ## Tests
  The checks that ran and passed, what was checked by hand, and what wasn't tested.

  ## For the owner to check        ← drafts only
  Exactly what to look at, and where.

  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  ```
- **Read the description back** (`gh pr view N --json body`) and check it arrived as written.

## 5. Watch it
- Call `get_status` from the app's PR tools. If it doesn't report this PR, bind it with `bind_pr`.
- **A PR opened as the App** (`reznik-gev-claude[bot]`): **don't turn on Auto-fix**, and don't ask the owner to. The owner starts each review round by saying "prepare #N" ([0142](../../../docs/decisions/0142-2026-11-11-no-auto-fix-for-app-prs.md)).
- **A PR opened with the owner's account:** turn on Auto-fix with `set_monitor` (`auto_fix` and `address_comments` on), without asking.
- Don't turn on auto-merge or auto-archive: those are [`merge-pr`](../merge-pr/SKILL.md)'s.

## 6. Report
- The PR's link, whether it's a draft, and whether CI is running.
- For a draft: what the owner should check, with the screenshots (`SendUserFile`). When the owner OKs it, `gh pr ready N`.
- For a ready PR: the bot is reviewing it. Handle its comments with [`prepare-pr-for-review`](../prepare-pr-for-review/SKILL.md).
- For a PR opened as the App: Auto-fix is off, so neither the bot's review nor a CI failure wakes the session. The owner says "prepare #N" when the review is in, and tells the session if CI fails.
