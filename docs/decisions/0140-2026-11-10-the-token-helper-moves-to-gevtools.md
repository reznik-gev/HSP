# 0140 — The token helper moves to GevTools, and renews only before `gh`

- **Date:** 2026-11-10
- **Status:** Accepted
- **Refines:** [0139](0139-2026-11-10-how-sessions-get-the-apps-tokens.md) (point 1: when the hook runs; point 6: where the helper lives)

## Context
[0139](0139-2026-11-10-how-sessions-get-the-apps-tokens.md) put the helper that gives Claude Code sessions the App's tokens in HSP, as `tools/github-app/`. The user's settings ran it from HSP's main checkout with `uv run --project`, and a `PreToolUse` hook renewed the token before every Bash and PowerShell command. 0139 said the helper could move to a repository of its own when a second project needs it. Since every project on the machine uses the App, they all need it now.

After [#160](https://github.com/reznik-gev/HSP/pull/160) merged, the owner asked two things: should the hook run only in HSP, and should the tool move to a private repository of its own? Claude found:
- **The hook costs about half a second** (0.4–0.7 s on the owner's machine) before every shell command, in every project, even when the token is fresh. Most of it is starting Python and loading the tool. `uv run` adds little.
- **Running it only in HSP** would undo 0139 point 3, the App in all projects.
- **Claude Code hooks have an `if` field** that takes one permission rule, such as `Bash(gh *)`, and runs the hook only for commands that match it. Only `gh` reads the token from its file. git doesn't need the hook, since its credential helper renews the token itself when git asks.
- **Every project ran whatever HSP's main checkout held.** That checkout isn't always on `main`: earlier on 2026-11-10 it was on `tools/github-app`.

The owner created the private repository [`reznik-gev/GevTools`](https://github.com/reznik-gev/GevTools), a home for all their developer tooling, mostly for Claude, and installed the App on it.

## Options considered
- **Move the helper to GevTools, installed with `uv tool install`** ✅
- **Keep it in HSP and run it from the main checkout:** no new repository, but every project depends on which branch one HSP checkout is on, and HSP carries a tool that isn't part of HSP.
- **A repository named after the tool (`github-app-token`):** one job per repository. Set aside: the owner wants one home for all their tooling.
- **Run the hook only in HSP:** set aside, as above.
- **Keep the hook before every command:** simplest, but half a second before every shell command in every project.

## Decision
1. **The helper lives in GevTools,** as [`github-app-token/`](https://github.com/reznik-gev/GevTools/blob/main/github-app-token/README.md), with its own CI. Its README has the machine setup. HSP's `tools/github-app/`, its CI job and its mentions in the README and CLAUDE.md go. Its history stays in HSP, up to 4125f48. *(The owner's choice, including the name GevTools)*
2. **Each machine installs it with `uv tool install`** from GevTools, and updates it with `uv tool upgrade`. The settings run the installed command by its full path, not a checkout. *(Claude's choice: a version installed on purpose, which no checkout's branch changes)*
3. **The renewal hook runs only before `gh` commands,** with two handlers: `"if": "Bash(gh *)"` and `"if": "PowerShell(gh *)"`. The session-start hook and the git helper stay as they were. *(Claude's choice)* The docs call the filter best-effort. A `gh` started from inside a script doesn't match, so after an hour it can find an expired token. Sessions run `gh` directly, as the skills do.
4. **The decisions about the helper stay in HSP's records,** 0137, 0139 and this one. GevTools' README links them. *(Claude's choice: GevTools has no records of its own yet)*

## Consequences
- GevTools: [`github-app-token/`](https://github.com/reznik-gev/GevTools/blob/main/github-app-token/README.md), moved, with a CI job, a README and a CLAUDE.md for the repository. Its setup step 3 now reads git's helper with `git config --get-all credential.helper`. With `--show-origin`, as before, the file name came first and was easy to copy into the settings by mistake.
- HSP: `tools/github-app/` and the `tools` CI job go. The git guide links GevTools. 0139's links to `tools/github-app/` no longer lead anywhere: this record says where it went.
- **Order matters on a machine already set up from HSP:** install from GevTools and change the settings first, as GevTools' README says under "Moving from HSP's copy", before HSP's main checkout takes this change. Otherwise the settings point at a folder that's gone, and `gh` and git fail in every session.
- Not checked yet: that the `if` filter works for the PowerShell tool. The hooks docs show only `Bash(...)` examples.
