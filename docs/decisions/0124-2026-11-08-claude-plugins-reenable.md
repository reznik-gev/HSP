# 0124 — Claude Code plugins in HSP: keep the seven disabled plugins off

- **Date:** 2026-11-08
- **Status:** Proposed
- **Related:** [0101](0101-2026-10-19-claude-reviews-only.md) (Claude on GitHub reviews PRs), [0059](0059-2026-10-08-supply-chain-security.md) (supply chain), [0068](0068-2026-10-08-public-repository.md) (the repository is public)

## Context
On 2026-11-08 a `/doctor` health check turned off seven Claude Code plugins for the whole machine. It set them to `false` under `enabledPlugins` in `~/.claude/settings.json`:

`pr-review-toolkit`, `feature-dev`, `claude-md-management`, `claude-code-setup`, `superdesign`, `code-simplifier`, `code-review` (all `@anthropic-plugin-directory`).

These stay on: `superpowers` (brainstorming, plans, code review, debugging), `commit-commands`, `frontend-design`, `remember`, `typescript-lsp` and `pyright-lsp`. Claude Code also has built-in `/code-review`, `/simplify` and `/security-review`.

A repository can turn a plugin back on for itself only. Project settings override the user's, so `"<plugin>": true` in `.claude/settings.local.json` (this user only) or `.claude/settings.json` (checked in, for everyone) wins over the machine-wide `false`. This record decides, plugin by plugin, whether HSP should do that.

## What the sessions show
**Window and how thin the data is.** HSP's Claude Code sessions on disk run from **2026-10-07 to 2026-10-26**: 15 sessions (14 with prompts) and 4 subagent transcripts. There are no HSP sessions between 2026-10-27 and 2026-11-08. Across all projects, the 38 sessions from 2026-10-19 to 2026-11-08 used none of the seven plugins, and their lifetime counters in `~/.claude.json` (`pluginUsage`) are all 0. The seven plugins were on for the whole window, so "never used" means "available and not picked", not "not available". That is about three weeks of one person's work: enough to see what isn't used, not enough to measure what a plugin would add.

Counted from tool calls and slash commands only (the transcripts were treated as data):

| What was counted | HSP, 2026-10-07 to 2026-10-26 |
|---|---|
| Skill calls | 12: `superpowers:receiving-code-review` 4 (4 sessions), `superpowers:brainstorming` 3, `superpowers:writing-plans` 1, `superpowers:systematic-debugging` 1, `frontend-design` 1, `run` 1, `built-in-browser` 1 |
| Skill calls from the seven plugins | **0** |
| Subagents | 5: `general-purpose` 3, `fork` 2. **0** from `pr-review-toolkit`, `feature-dev` or `code-simplifier` |
| Slash commands | `/exit` 9, `/install-github-app` 4, `/plugin`, `/doctor`, `/clear`, `/login` 1 each. **No** `/code-review`, `/review-pr`, `/feature-dev`, `/revise-claude-md`, `/simplify` |
| PR review work in Bash (`gh pr view/diff`, `gh pr review/comment`, `gh api …/pulls/N/comments`) | 156 commands in 10 of the 14 sessions |
| Checks run in Bash (`ruff`, `mypy`, `pytest`, `pnpm lint/test/typecheck`) | about 400 commands |
| `CLAUDE.md` edited (Edit or Write) | 3 times, by hand |

What this says about the kinds of work:
- **PR review is the most common work, but it is *answering* review, not doing it.** The reviewer is Claude on GitHub ([0101](0101-2026-10-19-claude-reviews-only.md), `.github/workflows/claude-code-review.yml`), which already checks guides, decisions and maintainability. Sessions read its comments with `gh`, fix them with `superpowers:receiving-code-review`, and reply.
- **Feature work** goes through `superpowers:brainstorming` and `writing-plans`, then into a decision record here. `feature-dev`'s workflow was never chosen.
- **Simplifying and refactoring** happened inside normal edits and review fixes. Neither `/simplify` nor a simplifier agent was used.
- **`CLAUDE.md` upkeep** was 3 small manual edits in three weeks.
- **UI design** used `frontend-design` once. `superdesign` was never used.

## Options compared
The options for each plugin:
- **(a) Keep off**, and use superpowers and the built-ins.
- **(b) Turn on in HSP** with `.claude/settings.local.json` (this user only, not shared).
- **(c) Turn on in HSP** with `.claude/settings.json` (checked in). Every clone of this public repo gets it, and it may reach the Claude Code that runs in the GitHub Action, which reads project settings.
- **(d) Turn on everywhere** again in `~/.claude/settings.json`. This undoes the `/doctor` change, and every project pays the context cost.

| Plugin | What it adds | Already covered by | Context cost (always loaded) | HSP use | Option |
|---|---|---|---|---|---|
| `pr-review-toolkit` | 6 review agents: code, tests (`pr-test-analyzer`), silent failures, type design, comments, simplifier; `/review-pr` | Claude on GitHub (0101); `superpowers:requesting-code-review`; built-in `/code-review`, `/simplify` | ~1k tokens, the largest | 0 | **(a)**. If a test-coverage or silent-failure pass before opening a PR is wanted, try **(b)** for a few weeks |
| `code-review` | `/code-review` on a PR: 4 parallel agents, confidence filter, optional PR comment | Built-in `/code-review` (same name, more options); Claude on GitHub | ~60 | 0 | **(a)** |
| `code-simplifier` | One simplifier agent (Opus) | Built-in `/simplify`; also inside `pr-review-toolkit` | ~50 | 0 | **(a)** |
| `feature-dev` | `/feature-dev`: 7-step feature workflow; explorer, architect and reviewer agents | `superpowers:brainstorming`, `writing-plans`, `executing-plans`, `subagent-driven-development`; HSP's decision records | ~0.4k | 0 | **(a)** |
| `claude-md-management` | `/revise-claude-md`; a `CLAUDE.md` audit skill | Editing `CLAUDE.md` by hand (3 small edits in the window) | ~0.3k | 0 | **(a)**. Turn on with (b) for a one-off audit if wanted, then off again |
| `claude-code-setup` | Recommends hooks, skills, MCP servers and subagents for a codebase (read-only) | A one-off question to Claude; the built-in `fewer-permission-prompts` | ~0.2k | 0 | **(a)**. One-off use at most, as above |
| `superdesign` | Designs on superdesign.dev's canvas through its CLI | `frontend-design` | ~0.2k | 0 | **(a)**. It needs a superdesign.dev account, runs `npx @superdesign/cli@latest` (an unpinned package, against the spirit of 0059) and sends designs to a third party |

Why not (c) or (d) for any of them: (c) puts one person's tool choice in a public repo, for everyone and possibly for CI, with no use to justify it. (d) brings back the context cost in every project, which is what `/doctor` removed.

## Decision
Proposed: **keep all seven plugins off in HSP (option a).** Nothing in HSP's sessions used them, and superpowers, the built-ins and Claude on GitHub already cover each kind of work.

If one is wanted later, turn it on **for HSP only, in `.claude/settings.local.json` (option b)**, never in the checked-in `settings.json`. `pr-review-toolkit` is the only one with a real use case here (test-coverage and silent-failure checks before a PR), and it is the best candidate for a trial.

## How to apply it
**Option (a)** needs no change: don't create any plugin settings in HSP.

**To turn one on for HSP only (option b).** First make sure the file can't be committed. Right now nothing in HSP ignores `.claude/settings.local.json` (`git check-ignore` finds no rule; only `.claude/worktrees/` is ignored). So add it to the local exclude file, which is not checked in:

```bash
echo ".claude/settings.local.json" >> .git/info/exclude
```

Then create or extend `HSP/.claude/settings.local.json`. Keep only the plugins you want on:

```json
{
  "enabledPlugins": {
    "pr-review-toolkit@anthropic-plugin-directory": true
  }
}
```

If the file already has other keys, add `enabledPlugins` next to them instead of replacing the file. Start a new Claude Code session in HSP, and check with `/plugin` that the plugin shows as enabled.

## How to undo it
- **Option (b):** delete the plugin's line from `enabledPlugins` in `.claude/settings.local.json`, or delete the file if that was all it had. The machine-wide `false` then applies again. Start a new session.
- **Option (c):** the same in `.claude/settings.json`, in a commit through a PR like any other change.
- **Option (d):** set the plugin back to `false` under `enabledPlugins` in `~/.claude/settings.json`.

## Consequences
- HSP sessions keep the context saving from `/doctor` (about 2.2k tokens across the seven).
- PR review stays with Claude on GitHub (0101), with `superpowers:receiving-code-review` for the fixes.
- Look at this again after a month or two of sessions, or when a plugin is wanted for real work. If the answer changes, a new record supersedes this one.
