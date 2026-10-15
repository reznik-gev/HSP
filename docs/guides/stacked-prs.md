# Working with stacked pull requests

A **stack** is a chain of PRs where each one builds on the one before it (for example login → sites → buildings → floors). Stacks keep PRs small and reviewable ([0076](../decisions/0076-2026-10-08-backend-delivery-plan.md)), but with **rebase-only merges** ([0069](../decisions/0069-2026-10-08-rebase-merges.md)) they need one extra step after each merge. We use GitHub's own stacks and the `gh stack` command for it ([0093](../decisions/0093-2026-10-16-github-stacked-prs.md)).

## Why stacks need restacking
```
before:   main ── X                          after merging PR 1 (rebase):
                   └── A  (PR 1)              main ── X ── A'        <- same change, NEW commit id
                        └── B  (PR 2)                  └── A ── B    <- PR 2 still carries the OLD A
```
A rebase-merge copies `A` onto `main` as a **new commit `A'`**. PR 2 still contains the old `A`, so GitHub sees the same change twice and reports the PR as out of date or conflicting. The fix is to **replay PR 2's own commits onto the new `main`**. Git notices that `A` is already there as `A'`, skips it, and no code has to be resolved by hand.

## Setting up (once per machine)
```bash
gh extension install github/gh-stack
git config --global rerere.enabled true       # remember conflict resolutions and reapply them
git config --global rebase.updateRefs true    # make --update-refs the default for manual rebases
```
`gh` is the [GitHub CLI](https://cli.github.com/). On Windows it installs to `C:\Program Files\GitHub CLI`; if Git Bash says `gh: command not found`, add `export PATH="$PATH:/c/Program Files/GitHub CLI"` to `~/.bashrc`.

## How PRs are set up
- PR 1 targets `main`. **PR 2 targets PR 1's branch**, PR 3 targets PR 2's branch, and so on. Each PR's diff therefore shows only its own changes.
- GitHub groups them as one stack, shown on every PR page in it.
- With **"Automatically delete head branches"** on (enabled for this repo), merging PR 1 deletes its branch, and **GitHub retargets PR 2 to `main` automatically**.

## Starting a stack
```bash
gh stack init api/sites        # first branch, based on main
# ...commit...
gh stack add api/buildings     # next branch, on top of the current one
# ...commit...
gh stack submit                # push every branch, open the PRs, group them on GitHub
gh stack view                  # see the stack
```
Branches that already have open PRs can be adopted, bottom to top, then synced:
```bash
gh stack init api/sites api/buildings api/floors
gh stack sync
```
`gh stack init` only recognises **open** PRs. Don't include a branch whose PR is already merged; set the stack up before anything in it merges.

## Merging: bottom up, then sync
1. Check the PR has no unanswered review comments and `ci-ok` passes.
2. Merge it with **Rebase and merge** on github.com, or from the command line:
   ```bash
   gh stack merge https://github.com/reznik-gev/HSP/pull/65 --rebase
   ```
   This merges that PR **and every unmerged PR below it** in one step: either all merge or none do. A bare number also works, but it's read as a stack number first, so the URL is clearer.
3. Restack the rest:
   ```bash
   gh stack sync --prune
   ```
   It fetches, skips the merged branches, rebases the rest of the stack onto `main`, pushes with `--force-with-lease` (which refuses to overwrite anything someone else pushed in the meantime), updates the stack on GitHub and deletes the merged local branches.

CI checks every pushed branch; there's no local test run during a sync.

## When there is a real conflict
Sometimes `main` and a stacked PR **changed the same lines**. `gh stack sync` then puts every branch back as it was and asks you to run `gh stack rebase`, which stops at the conflict:
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
3. `gh stack rebase --continue`. Repeat if it stops at another commit.
4. `gh stack push` to push the rebased branches.

To back out at any point, `gh stack rebase --abort` restores every branch to how it was before.

## Doing it by hand
If `gh stack` isn't available, the same restack for a single PR in plain Git:
```bash
git fetch origin
git switch <branch>
git rebase origin/main        # old copies of merged commits are skipped
git push --force-with-lease
```
For a whole stack, run `git rebase --update-refs origin/main` on the top branch, then push each branch.
