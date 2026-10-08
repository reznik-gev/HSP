# Working with stacked pull requests

A **stack** is a chain of PRs where each one builds on the one before it (for example login → sites → buildings → floors). Stacks keep PRs small and reviewable ([0076](../decisions/0076-2026-10-08-backend-delivery-plan.md)), but with **rebase-only merges** ([0069](../decisions/0069-2026-10-08-rebase-merges.md)) they need one extra step after each merge. This guide explains why, and how to handle it in one command ([0079](../decisions/0079-2026-10-08-stacked-pr-workflow.md)).

## Why stacks need restacking
```
before:   main ── X                          after merging PR 1 (rebase):
                   └── A  (PR 1)              main ── X ── A'        <- same change, NEW commit id
                        └── B  (PR 2)                  └── A ── B    <- PR 2 still carries the OLD A
```
A rebase-merge copies `A` onto `main` as a **new commit `A'`**. PR 2 still contains the old `A`, so GitHub sees the same change twice and reports the PR as out of date or conflicting. The fix is to **replay PR 2's own commits onto the new `main`**. Git notices that `A` is already there as `A'`, skips it, and no code has to be resolved by hand.

## How PRs are set up
- PR 1 targets `main`. **PR 2 targets PR 1's branch**, PR 3 targets PR 2's branch, and so on. Each PR's diff therefore shows only its own changes.
- With **"Automatically delete head branches"** on (enabled for this repo), merging PR 1 deletes its branch, and **GitHub retargets PR 2 to `main` automatically**.
- **Merge from the bottom up.** After each merge, restack the rest of the stack (next section), then merge the next PR.

## Restacking: one command
After a PR in a stack is merged, run this from the repo root on the **top** branch of the stack, or pass that branch's name:
```bash
scripts/restack.sh               # top = current branch
scripts/restack.sh api/floors    # or name it
```
The script:
1. Fetches `origin`.
2. Finds the branches in the stack. Branches whose changes are already on `main` are reported as **merged**. It compares *changes*, not commit IDs, so rebase-merged branches are recognized.
3. Rebases the whole stack onto `origin/main` in one go (`git rebase --update-refs`). Every branch pointer in the stack moves along, and already-merged commits are skipped.
4. Runs the checks for the areas the stack touches: backend (ruff, mypy, pytest) and/or frontend (typecheck, lint, tests).
5. Force-pushes the stack's branches with `--force-with-lease`, which refuses to overwrite anything someone else pushed in the meantime.

Options: `--no-checks` (CI still runs), `--no-push` (rebase and check locally only). To include the database tests in the local checks, set `HSP_TEST_DATABASE_URL` (see [backend/README.md](../../backend/README.md)).

PowerShell users can run `bash scripts/restack.sh`. Git for Windows includes bash.

## When there is a real conflict
Sometimes `main` and a stacked PR **changed the same lines**. Then the rebase stops, and the script exits with Git's conflict message:
```
CONFLICT (content): Merge conflict in backend/src/hsp/config.py
```
1. Open each listed file. Git marks the clash like this:
   ```
   <<<<<<< HEAD          (main's version)
   ...
   =======
   ...
   >>>>>>> 1a2b3c4 (your commit)
   ```
   Edit it into the correct final version and delete the markers.
2. `git add <file>` for each resolved file.
3. `git rebase --continue`. Repeat if Git stops at another commit.
4. Run `scripts/restack.sh` again. It continues from where it stopped, then checks and pushes.

To back out at any point, `git rebase --abort` restores everything to how it was before the rebase.

## Recommended Git settings (once per machine)
```bash
git config --global rerere.enabled true       # remember conflict resolutions and reapply them
git config --global rebase.updateRefs true    # make --update-refs the default for manual rebases
```

## Doing it by hand
The equivalent of the script for a single PR:
```bash
git fetch origin
git switch <branch>
git rebase origin/main        # old copies of merged commits are skipped
git push --force-with-lease
```
