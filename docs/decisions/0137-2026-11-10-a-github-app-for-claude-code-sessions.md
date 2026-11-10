# 0137 — Claude Code sessions push as a GitHub App, and the owner's approval merges

- **Date:** 2026-11-10
- **Status:** Accepted
- **Refines:** [0134](0134-2026-11-09-from-request-to-main.md) (the "to consider later" identity, and how a merge happens)

## Context
Claude Code sessions push, open PRs and comment with the owner's own GitHub account. GitHub doesn't let anyone approve their own PR, so the `main` ruleset requires no approvals, and the only merge signal is the owner saying "merge #N" in the session ([0134](0134-2026-11-09-from-request-to-main.md)). 0134 listed a separate identity for sessions as something to consider later, for HSP and for the owner's future projects. The owner and Claude went over it on 2026-11-10.

What's true today, checked on 2026-11-10:
- `reznik-gev/HSP` is public. The `main` ruleset requires a PR, with 0 approvals and no bypass.
- The `main` ruleset's list of required status checks is **empty**, although [0070](0070-2026-10-08-ci-gate-job.md) makes `ci-ok` the only required check, and the [git guide](../guides/git.md) says it must pass. The ruleset has drifted from an accepted decision.
- The review bot ([`claude.yml`](../../.github/workflows/claude.yml), [`claude-code-review.yml`](../../.github/workflows/claude-code-review.yml)) runs on each job's own `GITHUB_TOKEN`, so its comments come from `github-actions`. `claude-code-action` refuses runs started by a bot account unless that bot is listed in its `allowed_bots` input.
- Cloud sessions push through Anthropic's git proxy, with the GitHub connection of the owner's claude.ai account. Whatever local sessions use, cloud sessions keep acting as the owner.
- Coding agents today usually act under their own bot identity, and a person approves their work. GitHub's own docs recommend a GitHub App over a user's token for long-lived automation.

## Options considered
The identity sessions use:
- **A GitHub App** ✅. GitHub's recommended way. Exact permissions on exact repos, and tokens that last one hour. Installing it on a future project is one click. It costs extra setup: each machine holds the App's private key and a helper that turns it into tokens, and both Claude workflows need `allowed_bots`.
- A second GitHub account (machine user). Simplest to run: `gh auth login` once per machine, and no workflow changes. But it is one more account to secure. Fine-grained tokens can't reach another user's repos, so its token is broad and long-lived. Claude recommended it, for one owner. The owner chose the App, to follow GitHub's advice and stay ready for future projects, and accepted the extra setup.
- Not now: keep the owner's account, with "merge #N" as the only signal.

What the `main` ruleset requires:
- **One approval, of the latest push, with a bypass for the owner, for PRs only** ✅. The App can never merge code the owner hasn't approved. The bypass lets PRs from cloud sessions, and the owner's own PRs, still merge.
- An approval with no bypass. Then PRs from cloud sessions and from the owner's account could never merge.
- No approvals, as today.

What has a session merge:
- **The owner's approval on GitHub** ✅. The session wakes on it and merges with the [`merge-pr`](../../.claude/skills/merge-pr/SKILL.md) skill as today.
- GitHub auto-merge. It merges even when the session is closed. But it skips `merge-pr`'s last look at new comments, and stacked PRs restack only afterwards. It would also need `ci-ok` to be a required check first. The owner wants it considered later (below).
- Approval, and then "merge #N" in the session too. Two steps for one go-ahead.

Who is named as a commit's author:
- **The App, with the owner as co-author** ✅. The author matches who pushed and opened the PR. The owner's `Co-Authored-By` line shows who directed the work, and these commits still count on the owner's contribution graph.
- The App alone, with only Claude's `Co-Authored-By` line.
- The owner, as today. Then a commit and its PR show different names.

## Decision
1. **Local Claude Code sessions use a GitHub App** for `git push` and for `gh`, in HSP and in the owner's future projects. *(The owner's choice)* The App belongs to the owner's account and is installed only on the repos the owner picks. It is named **`reznik-gev-claude`**, without HSP in the name, since future projects use it too. *(The owner's choice)*
2. **Permissions:** repository Contents, Pull requests, Issues and Workflows: read and write; Actions, Checks and Metadata: read. No webhook, and nothing on the account level. *(Claude's choice, approved by the owner as a technical choice the owner didn't look into closely: Workflows lets sessions change files in `.github/workflows/`, which they do; the read permissions let `gh pr checks` and `gh run view` work)*
3. **The `main` ruleset requires one approval, and the latest push must be approved.** The repository admin role, so the owner, may bypass it, for PRs only. *(The owner's choice)* A push after the owner approves, Auto-fix's included, needs a new approval.
4. **The owner's approval on GitHub is the go-ahead to merge** a session's PR. The session merges with `merge-pr`, which first looks for new comments. For PRs from cloud sessions or from the owner's account, "merge #N" stays the signal, and they merge through the owner's bypass. *(The owner's choice)*
5. **Commits name the App as author,** `reznik-gev-claude[bot] <ID+reznik-gev-claude[bot]@users.noreply.github.com>`, where ID is the bot account's user id. The owner's `Co-Authored-By` line comes before Claude's, using the owner's usual git name and email. *(The owner's choice)*
6. **Cloud sessions keep using the owner's account.** Nothing changes for them. *(No choice: the proxy uses the claude.ai account's GitHub connection)*
7. **The private key is the secret.** Each machine keeps it outside every repository, readable only by the owner's user, and a copy lives in the owner's password manager. It is rotated yearly, and at once when a machine is lost: add a new key in the App's settings, replace it on each machine, then delete the old one. Tokens made from it last one hour and are never written to disk. *(Claude's choice, approved by the owner)*

### Setup, step by step (the owner's to do)
Sessions don't change credentials, tokens or repository settings themselves.
0. **Now, apart from the App:** add `ci-ok` back as a required status check on the `main` ruleset (Settings → Rules → `main` → Require status checks to pass), as [0070](0070-2026-10-08-ci-gate-job.md) decided.
1. **Create the App.** GitHub → Settings → Developer settings → GitHub Apps → New GitHub App. Name it `reznik-gev-claude`, and give the repository URL as its homepage. Untick "Active" under Webhook. Set the permissions in point 2. Pick "Only on this account". Note the **App ID**.
2. **Make a private key.** On the App's page, "Generate a private key". Store the `.pem` file as in point 7.
3. **Install it.** On the App's page, Install App → your account → "Only select repositories" → `HSP`. Note the **installation ID** from the page's URL.
4. **Merge the follow-up PR** (below): the token helper, and `allowed_bots` in both Claude workflows. Comment-triggered workflows run from `main`'s copy, so this goes first.
5. **On each machine,** set up the helper with the App ID, installation ID and key path, as the follow-up PR's guide says. Then check it on a test PR: the push, the PR and the bot's review all come from the App.
6. **Change the `main` ruleset last.** Settings → Rules → `main`: required approvals 1, tick "Require approval of the most recent reviewable push", and add the "Repository admin" role as a bypass with "For pull requests only".

## Consequences
- **A follow-up PR, once the App exists:**
  - a token helper, kept in the repository: a git credential helper and a `gh` wrapper that mint an installation token from the key, set up through `~/.claude/settings.json` `env` so the owner's own git and `gh` stay as they are;
  - `allowed_bots: reznik-gev-claude[bot]` in both Claude workflows, so the bot still reviews the App's PRs and its `@claude review` comments;
  - the guides and skills updated for decision points 4 and 5: [How a change is made](../guides/making-a-change.md) step 10, [`merge-pr`](../../.claude/skills/merge-pr/SKILL.md), [`open-pr`](../../.claude/skills/open-pr/SKILL.md) for the commit lines, and the [git guide](../guides/git.md).
  Until it merges and the ruleset changes, 0134's path stays as it is.
- **`ci-ok` isn't a required check today** (see Context), although [0070](0070-2026-10-08-ci-gate-job.md) makes it the only required check. The owner adds it back with setup step 0, without waiting for the App. It matters more once approvals merge, and auto-merge would need it.
- **To consider later:** GitHub auto-merge, and changing the `merge-pr` skill to go with it. *(The owner's request)*
- The review bot keeps its `GITHUB_TOKEN`, so its comments still come from `github-actions`. The rule on which threads a session may resolve is unchanged.
- In a future project, the owner installs the same App on the new repository and adds the same ruleset. Each machine already has the key.
- The owner's approval still isn't independent of the request: the owner asked for the change too. GitHub's own coding agent doesn't count such approvals. In a one-owner project there is no one else, and the approval is still a deliberate step, recorded on GitHub.
