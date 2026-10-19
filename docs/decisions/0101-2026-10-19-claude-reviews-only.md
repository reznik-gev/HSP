# 0101 — Claude on GitHub reviews; it doesn't write code

- **Date:** 2026-10-19
- **Status:** Accepted
- **Supersedes:** [0100](0100-2026-10-19-claude-bot-tools.md), except that the bot still reads with read-only `git` and `gh` commands and searches the web.

## Context
After a day of review fixes by the `@claude` bot, the owner wasn't happy with its code and refactors:
- It did exactly what a comment said, even when that had a downside. For example, it ignored `secrets/` and `tls/` folders at any depth.
- It bundled unrelated fixes into one commit, against the [git guide](../guides/git.md).
- It ran on Sonnet, with no context beyond `CLAUDE.md` and the comment, and it can't ask questions in the middle of a run.

Coding now happens in long Claude Code sessions with the owner. On GitHub, Claude only reviews.

## Decision
**The `@claude` bot** (`claude.yml`) answers questions and reviews. It never changes code.
- It runs on the job's own `GITHUB_TOKEN` (`github_token` input), not the Claude app's token. The job has `contents: read` and `pull-requests: write` / `issues: write`, so GitHub itself refuses a push, while comments work.
- The tool rules say the same: editing files, `git add/commit/push`, the action's commit tools, and the `gh api` write flags are blocked. A system-prompt note tells it to reply with what it would change. For a small, certain fix, it posts a GitHub **suggestion** that the owner can apply with one click.
- It reads the whole PR: description, commits, all comments and review threads (`gh api` for comments on lines), the full history (`fetch-depth: 0`), CI results and the web.
- It runs on **Sonnet 5.5** (owner's choice): it's for quick questions.
- The setup from 0100 that let it run the checks (uv, pnpm, PostGIS) is removed. CI runs the checks, and the bot reads their results.

**The code review** (`claude-code-review.yml`) checks **guide and decision compliance first, then maintainability**, then any clear bugs it notices. The old `code-review` plugin looked for bugs and `CLAUDE.md` compliance only.
- A prompt written for HSP tells it to read `CLAUDE.md`, the guides (including the testing guide's review checklist), the relevant decisions, and the whole PR. It skips what linters already enforce, and doesn't repeat points already raised.
- It reports with inline comments on lines, with suggestions where the fix is small and certain, and one summary comment.
- It runs on **Opus 5.5** (owner's choice).
- It runs when a PR is **opened or marked ready** (not drafts), and again when someone with write access comments **`@claude review`** on the PR. Owner's choice: fewer repeated reviews than reviewing every push. `claude.yml` ignores comments that start with `@claude review`, so a request starts only the full review.
- It uses its own `GITHUB_TOKEN` too, with the same permissions. It isn't part of `ci-ok`, so it never blocks a merge.

## Consequences
- Comments come from `github-actions[bot]`, not `claude[bot]`, because they're made with the job's token. Comments made with that token don't start other workflows, so the bot can't trigger itself.
- `allowed_bots` is gone: no bot pushes code any more.
- A review-fix push gets no automatic review. Ask with `@claude review` when the fixes are in.
- The bot's runs are faster, because nothing is installed. The full review costs more per run (Opus), but it runs less often.
- The `CLAUDE.md` section "Before you push" stays: it's for Claude Code sessions.
