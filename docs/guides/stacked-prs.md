# Working with PRs that build on other PRs

Sometimes a change needs another that isn't merged yet: PR Y builds on PR X. Small PRs that build on each other keep review easy ([0076](../decisions/0076-2026-10-08-backend-delivery-plan.md)), but **each one is a single PR into `main`**, reviewed and merged on its own, and **Y can't merge until X has** ([0154](../decisions/0154-2026-11-22-prs-that-build-on-others-merge-one-at-a-time.md)). CI enforces it. For branches, commits and reviews in general, see [Working with Git and pull requests](git.md).

## The rules
- **Every PR's base is `main`.** Never another PR's branch: a PR merges into its base, and only `main` is protected by the rulesets.
- **Y is cut from X's branch,** so it holds X's commits too. Until X merges, Y's diff on GitHub shows X's changes as well. To see Y's own, compare the two branches: `https://github.com/reznik-gev/HSP/compare/<X's branch>...<Y's branch>`.
- **Y stays a draft while X is open.** The review bot skips drafts, so it reviews Y once, after the rebase, on Y's own commits.
- **CI refuses Y while X is open.** The `builds-on-open-pr` job, which `ci-ok` needs, fails a PR that holds another open PR's head commit, and names that PR. `ci-ok` is required on `main`, so GitHub refuses the merge, whether it's a click, auto-merge or `gh`.
- **When X merges, rebase Y onto `main`,** push with `--force-with-lease` and mark it ready. Nothing re-runs Y's CI when X merges; the rebase push does.
- A chain works the same way: W on Y on X stays a draft until both have merged. Rebase each PR once the one right below it has merged.

## Setting up (once per machine)
```bash
git config --global rerere.enabled true       # remember conflict resolutions and reapply them
```
`gh` is the [GitHub CLI](https://cli.github.com/). On Windows it installs to `C:\Program Files\GitHub CLI`; if Git Bash says `gh: command not found`, add `export PATH="$PATH:/c/Program Files/GitHub CLI"` to `~/.bashrc`. The `gh stack` extension isn't used any more.

## Building Y on X
```bash
git fetch origin
git switch -c api/buildings origin/api/sites   # Y's branch, from X's
# ...commit...
git push -u origin api/buildings
gh pr create --draft --base main --title "..." --body-file <file>
```
Say in Y's description that it builds on X (`Builds on #X`), so a reader knows why it's a draft.

If X gets review fixes while Y is open, Y can stay as it is until X merges. Rebase it then, as below.

## When X merges: rebase Y
A rebase-merge copies X's commits onto `main` as **new commits**. Y still holds the old ones:
```
before:   main ── M                       after X merges (rebase):
                  └── x1  (X)              main ── M ── x1'        <- same change, NEW commit id
                       └── y1  (Y)                  └── x1 ── y1   <- Y still holds the OLD x1
```
Until Y is rebased, `builds-on-open-pr` fails it for holding copies of commits already on `main`. Replay Y's own commits onto the new `main`:
```bash
git fetch origin
git switch api/buildings
git rebase origin/main        # old copies of X's commits are skipped
git push --force-with-lease
gh pr ready <Y>
```
`--force-with-lease` refuses to overwrite anything someone else pushed in the meantime.

Git skips the old copies only when they match what landed on `main`. They don't when X changed after Y was cut, for example with review fixes. The rebase then stops at a conflict in one of X's commits, not Y's. Abort it, and replay only Y's own commits:
```bash
git rebase --abort
git rebase --onto origin/main <the commit just below Y's first commit>
```
`gh pr view <Y> --json commits` lists the branch's commits, oldest first: X's old commits come first, then Y's own.

## When there is a real conflict
Sometimes `main` and Y **changed the same lines**. The rebase stops:
```
CONFLICT (content): Merge conflict in backend/src/musical_chairs/config.py
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
3. `git rebase --continue`. Repeat if it stops at another commit.
4. Run the checks, then `git push --force-with-lease`.

To back out at any point, `git rebase --abort` puts the branch back as it was.

## If X closes without merging
Y still holds X's commits, and CI no longer stops it. Drop X's commits (`git rebase --onto origin/main <the commit just below Y's first commit>`) if Y works without them, or ask the owner.
