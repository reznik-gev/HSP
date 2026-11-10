---
name: run-demo
description: Bring up the Northwind demo on a PR's code (or main), reseeded, so the owner can check it by hand. Reuse the running demo, switch it to the PR with deploy/demo/demo.py, look at it in the browser pane and send the owner screenshots. Use when a draft needs the owner's eyes, or the owner says "set up the demo" or "show me #N".
---

# Run the demo for a PR

There is one demo, in `.claude/worktrees/demo` under the main checkout, on ports 8000 (API) and 5173 (app), with the `hsp_demo` database ([0136](../../../docs/decisions/0136-2026-11-10-the-demo-for-checking-prs.md)). [`deploy/demo/demo.py`](../../../deploy/demo/demo.py) does the setup in [the demo guide](../../../docs/demos/northwind-robotics.md). Run it from `backend/` of any checkout. Do these steps in order.

**Never** remove the demo worktree or commit in it.

## 1. What's running now?
```bash
uv run python ../deploy/demo/demo.py status
```
- If it already shows the PR's latest commit and both are up, skip to step 3. Reseed first (`uv run python ../deploy/demo/seed.py`, from the demo worktree's `backend/`) only if the owner says yes.
- Otherwise, if the API or the app is up, **ask the owner before going on**: say which commit the demo shows. Don't start a second demo.

## 2. Switch it
Only after the owner said yes in step 1, or when neither server was up:
```bash
uv run python ../deploy/demo/demo.py switch --pr <N>    # or --main
```
It takes about two minutes and ends with `Ready: open http://localhost:5173 …`. It gets the code, stops the old servers, installs the dependencies, rebuilds `hsp_demo`, starts the servers in the background and reseeds.
- If it says a port is in use by something it didn't start, find what it is and ask the owner before you stop it.
- If the API isn't ready, read the log it names.

## 3. Check it in the browser pane
- Open <http://localhost:5173> and sign in as `dana.levin` / `demo` if asked.
- Go to what the PR changes, and try it.
- Look at it in **English and Hebrew** (the translate button, top right), and at a **narrow width** if the layout changed. Switch back to English when done.
- Screenshot what the owner will want to see.

## 4. Tell the owner
- What the demo shows now (PR and commit), and that it was reseeded.
- What to check, and where (the page, floor or desk), with the screenshots (`SendUserFile`).
- Sign-in: `dana.levin` (admin) or `sam.carter` (view only), password `demo`.
