# 0136 — The demo for checking PRs runs from one worktree, and switches only after asking

- **Date:** 2026-11-10
- **Status:** Accepted
- **Refines:** [0103](0103-2026-10-19-demo.md) (the demo is also used to check PRs by hand), [0134](0134-2026-11-09-from-request-to-main.md) (how a draft is checked)

## Context
The owner checks a PR's UI by hand in the Northwind demo (0103), and has kept it running between PRs since 2026-11-10. Each time, a session set it up from scratch, and the same problems came back. `pnpm` isn't on the PATH, so `pnpm dev` fails. A new worktree has no `node_modules`. `.claude/launch.json` isn't in Git. The API doesn't reload, so it shows old code until restarted. The demo also ran from the PR's own worktree. When #151 merged, its worktree couldn't be removed until another session moved the demo to #152's worktree.

Only one demo can run at a time: ports 8000 and 5173, the Keycloak redirect and the `hsp_demo` database are all fixed. So bringing up one PR's demo replaces whatever was showing. Reseeding resets the data too.

## Options considered
Where the demo's code lives:
- **One demo worktree, `.claude/worktrees/demo`, that checks out each PR's commit** ✅. The servers always run from the same folder. A PR's worktree can be removed at merge like any other.
- The PR's own worktree, as before. Its worktree has to be kept until the demo moves on, and `merge-pr` has to know to skip it.

Taking over a demo that's running:
- **Ask the owner first** ✅, saying what the demo shows now. The owner may be in the middle of checking something.
- Switch without asking, since asking for a demo for a PR means the last one is done.

How the setup is done:
- **A Python script, `deploy/demo/demo.py`, that the skill runs** ✅. The same steps run every time, it can be run by hand, and it uses only the standard library, so it runs wherever the repo does. Only starting and stopping the servers differ between Windows and elsewhere.
- PowerShell commands in the skill. The first bot review found two slips in them: variables lost between calls, and the dev stack started from the wrong compose file.
- A PowerShell script. Simpler on Windows, but not portable.

## Decision
- **The [`run-demo`](../../.claude/skills/run-demo/SKILL.md) skill** brings the demo up on a PR's code (or `main`), reseeded, then checks it in the browser pane and sends the owner screenshots. *(Claude's choice: the name.)*
- **It runs from `.claude/worktrees/demo`,** with the commit checked out detached, so the branch can stay checked out in the PR's own worktree. *(The owner's choice.)*
- **Before switching or reseeding a running demo, the session asks the owner,** naming the PR it shows now. *(The owner's choice.)*
- **The setup is `deploy/demo/demo.py`** (`status`, `switch --pr N` or `--main`, `stop`), in Python with the standard library only. *(The owner's choice: Python, for portability.)* The skill keeps what needs judgment: asking the owner, the browser check and the screenshots.
- **The script starts the servers in the background,** not as Browser-pane preview servers or terminal tabs, so they keep running after the session that started them is archived. It stops only the servers it started, and refuses when something else holds a port. *(Claude's choice.)*
- **It never removes the demo worktree,** and refuses to switch when the worktree has local changes. *(Claude's choice.)*

## Consequences
- `docs/guides/making-a-change.md` (step 6) and the `open-pr` skill point to `run-demo` for drafts the owner must check. `merge-pr` leaves the demo worktree in place.
- The first move to the demo worktree took the demo from #152's worktree (`brave-perlman-89a14c`) and put it on `main`.
- `seed.py` and `demo.py` aren't in CI's lint and type checks, which cover `backend/` only. `demo.py` passes `ruff` and `mypy --strict` when run on it by hand.
