# github-app-token

Lets Claude Code sessions work on GitHub as the owner's GitHub App, `reznik-gev-claude`, rather than as the owner ([0137](../../docs/decisions/0137-2026-11-10-a-github-app-for-claude-code-sessions.md), [0139](../../docs/decisions/0139-2026-11-10-how-sessions-get-the-apps-tokens.md)). The owner can then approve the PRs sessions open. It does three jobs, each run from the user's Claude Code settings:

| Command | Run by | What it does |
|---|---|---|
| `github-app-token refresh` | A `PreToolUse` hook, before each Bash or PowerShell command | Renews the App's one-hour token when it has under 10 minutes left |
| `github-app-token session-start` | A `SessionStart` hook | Renews the token, and tells the session whether the App reaches the repository it starts in |
| `github-app-token git-credential get` | git, as a credential helper | Hands git the token for repositories the App is installed on |

The token lives in a `gh` config folder that only Claude Code sessions use (`GH_CONFIG_DIR`), so plain `gh` uses it there, in both shells. The owner's own `gh` and git logins are untouched. The token is on disk for at most an hour, and only the user can read it.

Which repository a session is in decides the rest:
- **The App is installed on it:** git and `gh` act as `reznik-gev-claude[bot]`.
- **The owner's repository, without the App:** git refuses to push or fetch, rather than use the owner's login, and prints where to install the App. The session start tells the session to ask the owner to install it.
- **Another account's repository:** the App can't be installed there. git uses the owner's own login, and `gh` can only read what's public.

On a machine without the settings below, every command does nothing.

## Setting up a machine
You need `uv`, `gh` and Git, and the HSP checkout's `main`.

1. **The private key.** Keep the App's `.pem` file outside every repository, in a folder only your user can read, such as `~/.config/git/`. A copy belongs in your password manager. Never commit it or paste it anywhere.
2. **The helper's environment:** in the HSP checkout, run
   ```bash
   uv sync --frozen --project tools/github-app
   ```
3. **Find git's usual credential helper,** which git falls back to for other accounts' repositories:
   ```bash
   git config --show-origin --get-all credential.helper
   ```
   On Windows it's `manager`; on a Mac usually `osxkeychain`.
4. **Add these to `~/.claude/settings.json`,** merged with what's there. Replace `<HSP>` with the HSP checkout's full path (forward slashes on Windows too), `<KEY>` with the key file's path, `<HOME>` with your home folder, and `<USUAL HELPER>` with the helper from step 3.
   ```json
   {
     "env": {
       "CLAUDE_GITHUB_APP_ID": "5699699",
       "CLAUDE_GITHUB_APP_INSTALLATION_ID": "180587576",
       "CLAUDE_GITHUB_APP_KEY_FILE": "<KEY>",
       "GH_CONFIG_DIR": "<HOME>/.config/gh-reznik-gev-claude",
       "GIT_AUTHOR_NAME": "reznik-gev-claude[bot]",
       "GIT_AUTHOR_EMAIL": "354985357+reznik-gev-claude[bot]@users.noreply.github.com",
       "GIT_COMMITTER_NAME": "reznik-gev-claude[bot]",
       "GIT_COMMITTER_EMAIL": "354985357+reznik-gev-claude[bot]@users.noreply.github.com",
       "GIT_CONFIG_COUNT": "4",
       "GIT_CONFIG_KEY_0": "credential.https://github.com.helper",
       "GIT_CONFIG_VALUE_0": "",
       "GIT_CONFIG_KEY_1": "credential.https://github.com.helper",
       "GIT_CONFIG_VALUE_1": "!uv run --project <HSP>/tools/github-app --frozen -q github-app-token git-credential",
       "GIT_CONFIG_KEY_2": "credential.https://github.com.helper",
       "GIT_CONFIG_VALUE_2": "<USUAL HELPER>",
       "GIT_CONFIG_KEY_3": "credential.https://github.com.useHttpPath",
       "GIT_CONFIG_VALUE_3": "true"
     },
     "hooks": {
       "SessionStart": [
         { "hooks": [{ "type": "command", "command": "uv run --project <HSP>/tools/github-app --frozen -q github-app-token session-start" }] }
       ],
       "PreToolUse": [
         { "matcher": "Bash|PowerShell", "hooks": [{ "type": "command", "command": "uv run --project <HSP>/tools/github-app --frozen -q github-app-token refresh" }] }
       ]
     }
   }
   ```
   The empty helper first clears the helpers git already knows, so the App's comes before your own login. `useHttpPath` lets the helper see which repository git is asking about.
5. **Start a new Claude Code session** in HSP and check, in it:
   ```bash
   gh auth status
   ```
   ```bash
   git ls-remote origin HEAD
   ```
   `gh` should say it's logged in as `reznik-gev-claude[bot]`, and `git ls-remote` should print a commit. In a terminal of your own, `gh auth status` should still show your own account.

The App ID, installation ID and bot account above are the owner's App's. They aren't secret.

## A new project
Install the App on the new repository: github.com/settings/installations → `reznik-gev-claude` → Configure → Repository access. A session started there before you do will ask you to.

## Rotating the key
Every year, and at once if a machine is lost: in the App's settings, generate a new private key. Replace the file on each machine, and in your password manager. Then delete the old key in the App's settings. Tokens already handed out stop working within an hour.

## Development
Checks, as in `backup/`: `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy` and `uv run pytest`. The tests use a fake GitHub and a key made for each test, so they need no network and no real key.
