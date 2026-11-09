---
name: open-pr
description: Take finished HSP work from a branch to an open pull request. Run the checks, add the CHANGELOG line, push, open the PR without asking (as a draft when the owner must check something first), read the description back, and turn on Auto-fix. Use when a change is built and tested and ready to go up, or the owner says "open a PR", "push it" or "ship it".
---

# Open a pull request

The owner doesn't need to be asked before a PR opens ([0134](../../../docs/decisions/0134-2026-11-09-from-request-to-main.md)). Do these steps in order, and say which one you're on. The rules behind them are in [the git guide](../../../docs/guides/git.md).

## 1. Is it ready to go up?
- Every decision it makes is in a record ([`record-decision`](../record-decision/SKILL.md)), and the owner has answered every question that's theirs.
- You know what "done" means for this change: the owner said, or you stated it. Check the change meets it.
- Commits follow the git guide: each a meaningful step that passes the checks on its own, with a message that says what changes for the user and why.

## 2. Run the checks
- Run the checks for each side the branch changes, as CLAUDE.md lists them. DB tests need the dev stack running and `HSP_TEST_DATABASE_URL` set ([backend/README.md](../../../backend/README.md)).
- If a check fails for a reason that isn't this branch's, check whether it also fails on `main`, and say so in the PR. Don't push anything that fails because of this branch.
- If the change shows on screen, open it in the browser pane and look at it: both languages, and at a narrow width if layout changed. Keep screenshots of what the owner will want to see.

## 3. The CHANGELOG
If users or operators notice the change, add a line under `## [Unreleased]` in `CHANGELOG.md` ([how](../../../docs/guides/releasing.md#between-releases-keep-the-changelog)). Leave out internal changes: tests, refactors, CI, docs for developers.

## 4. Push and open
- Bring the branch up to date with `origin/main` first (or the PR below it, in a stack). See [the stacked PRs guide](../../../docs/guides/stacked-prs.md).
- **Ready or draft?** Open it as a **draft** if the owner must check something before the bot reviews it: how it looks or feels, or a choice you couldn't settle. Otherwise open it ready. The bot reviews a PR when it opens ready or is marked ready, never a draft.
- Open it with `gh pr create` (add `--draft` for a draft). In a stack, use `gh stack submit`, then edit each description. The description has these parts:
  ```markdown
  ## What changes
  For the user or operator, in plain words.

  ## How it's built
  The main parts, and anything a reviewer should read first.

  ## Decisions
  The records it adds or follows. List each *(Claude's choice)* point, so the owner can check it.

  ## Done means
  The definition of done, and how the change meets it.

  ## Tests
  The checks that ran and passed, what was checked by hand, and what wasn't tested.

  ## For the owner to check        ← drafts only
  Exactly what to look at, and where.

  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  ```
- **Read the description back** from GitHub (`gh pr view N --json body`) and check it arrived as written.

## 5. Watch it
- Call `get_status` from the app's PR tools. If it doesn't report this PR, bind it with `bind_pr`.
- **Turn on Auto-fix** with `set_monitor` (`auto_fix` and `address_comments` on), without asking ([0134](../../../docs/decisions/0134-2026-11-09-from-request-to-main.md)). The app then wakes this session for CI failures, merge conflicts and review comments.
- Don't turn on auto-merge or auto-archive. Merging and cleanup are [`merge-pr`](../merge-pr/SKILL.md)'s.

## 6. Report
One message:
- The PR's link, whether it's a draft, and whether CI is running.
- For a draft: what the owner should check, with the screenshots (send them with `SendUserFile`).
- For a ready PR: the bot is reviewing it. When its comments come in, handle them with [`prepare-pr-for-review`](../prepare-pr-for-review/SKILL.md).

When the owner OKs a draft, mark it ready with `gh pr ready N`. The bot's review starts then.
