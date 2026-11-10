# 0139 — How Claude Code sessions get the GitHub App's tokens

- **Date:** 2026-11-10
- **Status:** Accepted
- **Refines:** [0137](0137-2026-11-10-a-github-app-for-claude-code-sessions.md) (where tokens are kept, which sessions use the App, and the setup)
- **Refined by:** [0140](0140-2026-11-10-the-token-helper-moves-to-gevtools.md) (the helper moves to GevTools, and renews only before `gh`), [0143](0143-2026-11-11-the-owner-merges-their-own-prs.md) (point 7: a session acting as the App can't use `--admin`, so the owner merges such PRs on GitHub)

## Context
[0137](0137-2026-11-10-a-github-app-for-claude-code-sessions.md) decided that local Claude Code sessions push and use `gh` as the GitHub App `reznik-gev-claude`. It left a token helper to a follow-up PR, and said tokens are never written to disk. On 2026-11-10 the owner created the App and installed it on HSP, and Claude tested it on the owner's Windows machine:
- A one-hour installation token covers only the selected repos, with exactly the permissions in 0137.
- `git` works with it through a credential helper. Git asks the helper on every push and fetch, so the helper can hand out a fresh token each time.
- `gh` works with it when the token is in `hosts.yml` in a `gh` config folder of its own (`GH_CONFIG_DIR`). `gh auth status` then reports `reznik-gev-claude[bot]`, and the owner's own `gh` login is untouched.
- `gh` reads its token once per run, from `GH_TOKEN` or its config. A wrapper in front of the real `gh` would need `PATH` changed for Claude sessions only, and that isn't reliable: the PowerShell tool starts with `-NoProfile`, `CLAUDE_ENV_FILE` reaches only the Bash tool, and the desktop app is reported to ignore `env.PATH` in Claude's settings. Plain variables in the settings' `env`, like `GH_CONFIG_DIR`, reach both shells.

## Options considered
How `gh` gets a fresh token:
- **A token file in a `gh` config folder only Claude sessions use, renewed by a hook** ✅. A Claude Code hook runs before each Bash or PowerShell command and renews the token when it has less than 10 minutes left. Plain `gh` just works, in both shells. A live token sits on disk for at most an hour, in a file only the owner's user can read.
- Never on disk: sessions call `gh-app …` instead of `gh`, and plain `gh` fails on purpose so it can't quietly use the owner's account. Keeps 0137 as written, but every guide, skill and habit that says `gh` would change, and sessions would trip over it.
- A `gh` stand-in on `PATH` for the Bash tool only. The PowerShell tool wouldn't get it.

Which sessions act as the App:
- **Every Claude Code session on a machine set up for it, in every project** ✅. A new project only needs the App installed on its repository.
- Only projects that opt in, each in its own `.claude/settings.local.json`. One more step per project and machine.

## Decision
1. **`gh`'s token lives in a `gh` config folder used only by Claude Code sessions**, set by `GH_CONFIG_DIR` in the user's Claude Code settings. A `PreToolUse` hook on Bash and PowerShell renews it when it has under 10 minutes left. The token is on disk for at most an hour, readable only by the owner's user. This replaces 0137's "never written to disk" for tokens. The private key stays as 0137 point 7 says. *(The owner's choice)*
2. **Git gets its token from a credential helper**, which uses the same token and renews it the same way. *(Claude's choice: one token for both, so a push and a `gh` call in the same minute don't mint two)*
3. **It applies to every project on a machine set up for it**, through `~/.claude/settings.json`. *(The owner's choice)*
4. **A repository of the owner's account that the App isn't installed on:** git refuses to push or fetch with the owner's login there, and says where to install the App. When a session starts in such a repository, the hook tells the session to ask the owner to install the App first, with the link. *(The owner's choice)*
5. **A repository of another account**, where the App can't be installed: git falls back to the owner's own login, as today. `gh` there can only read what's public. *(Claude's choice: the App is installable only on the owner's account, so there's nothing to prompt for)*
6. **The helper is a small Python tool in HSP, [`tools/github-app/`](../../tools/github-app/README.md)**, run with `uv`, with the same checks as `backup/` and its own CI job. The user's settings point at the main checkout's copy, and its README has the setup for a machine. *(Claude's choice: HSP is where the owner's tooling lives today; it can move to a repository of its own when a second project needs it)*
7. **Merging a PR from the owner's account** (a cloud session's, or the owner's own) after "merge #N" uses `gh pr merge --admin`, which uses the owner's bypass of the `main-approvals` ruleset. The `main` ruleset has no bypass, so `ci-ok` still has to pass. For the App's PRs, a session never uses `--admin`. *(Claude's choice: this is how 0137 point 4's bypass is used)*
8. **Commit lines:** the App is the author through `GIT_AUTHOR_*` and `GIT_COMMITTER_*` in the settings. Each commit message ends with `Co-Authored-By:` for the owner, from `git config user.name` and `user.email`, and then the one for Claude. *(The owner's choice, in 0137 point 5; Claude's choice to read the owner's line from git's config, so no guide holds an email address)*

## Consequences
- New: [`tools/github-app/`](../../tools/github-app/README.md), a `tools` job in CI, and the machine setup in its README.
- `allowed_bots: reznik-gev-claude[bot]` in both Claude workflows, so the review bot accepts the App's PRs and its `@claude review` comments.
- The guides and skills switch to the approval as the go-ahead to merge (0137 point 4): [How a change is made](../guides/making-a-change.md), the [git guide](../guides/git.md), and the [`merge-pr`](../../.claude/skills/merge-pr/SKILL.md) and [`prepare-pr-for-review`](../../.claude/skills/prepare-pr-for-review/SKILL.md) skills. They hold from the time a machine is set up for the App. Until then, and for PRs from the owner's account, "merge #N" stays the signal.
- The owner's steps, in order, after this PR merges: set up this machine as the README says, check it on a test PR, then add the `main-approvals` ruleset (0137 setup step 6).
- **To consider later,** as in 0137: GitHub auto-merge, and the `merge-pr` changes to go with it.

## Updates
- *Update, 2026-11-11:* the owner named the approval ruleset `main-approvals` on GitHub, with a hyphen. This record's mentions of `main approvals` now use that name, with the owner's yes ([0126](0126-2026-11-08-what-may-change-in-an-accepted-record.md) point 4).
- *Update, 2026-11-11:* the helper moved to GevTools ([0140](0140-2026-11-10-the-token-helper-moves-to-gevtools.md)), so this record's links to `tools/github-app/` no longer lead anywhere. Its README is now [`github-app-token/README.md`](https://github.com/reznik-gev/GevTools/blob/main/github-app-token/README.md) in GevTools.
