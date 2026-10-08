#!/usr/bin/env bash
# Restack a chain of stacked PR branches onto origin/main (docs/decisions/0079).
#
# Run it after a PR lower in the stack was merged (merges are rebase-only, docs/decisions/0069,
# which gives the merged commits new IDs; the old copies are dropped automatically here).
#
#   scripts/restack.sh                # restack the stack ending at the current branch
#   scripts/restack.sh api/floors     # ...ending at a given branch
#   scripts/restack.sh --no-checks    # skip local checks (CI still runs)
#   scripts/restack.sh --no-push      # rebase + check, but don't push
#
# If a real conflict stops the rebase: fix the files, `git add` them, `git rebase --continue`,
# then run this script again (it picks up where it left off). `git rebase --abort` undoes it.
set -euo pipefail

checks=1
push=1
top=""
for arg in "$@"; do
  case "$arg" in
    --no-checks) checks=0 ;;
    --no-push) push=0 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    -*) echo "unknown option: $arg" >&2; exit 2 ;;
    *) top="$arg" ;;
  esac
done

root="$(git rev-parse --show-toplevel)"
cd "$root"

if [ -d "$(git rev-parse --git-path rebase-merge)" ] || [ -d "$(git rev-parse --git-path rebase-apply)" ]; then
  echo "A rebase is in progress. Finish it with 'git rebase --continue' (or '--abort'), then rerun." >&2
  exit 1
fi
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Your working tree has uncommitted changes. Commit or stash them first." >&2
  exit 1
fi

top="${top:-$(git branch --show-current)}"
if [ -z "$top" ] || [ "$top" = "main" ]; then
  echo "Run this on (or pass) the TOP branch of a stack, not main." >&2
  exit 1
fi

echo "> fetching origin"
git fetch --quiet --prune origin

# Commits of $1 whose changes are NOT yet on origin/main. Compares patches, not commit IDs:
# a rebase-merge gives merged commits new IDs, so ancestry alone can't tell what's merged.
unmerged() { git cherry origin/main "$1" | grep -c '^+' || true; }

# The stack = local branches reachable from $top that still carry unmerged changes;
# branches whose changes are all on main already are reported as merged.
stack=()
merged=()
while IFS= read -r branch; do
  [ "$branch" = "main" ] && continue
  git merge-base --is-ancestor "$branch" "$top" || continue
  if [ "$(unmerged "$branch")" = "0" ]; then
    [ "$branch" != "$top" ] && merged+=("$branch")
  else
    stack+=("$branch")
  fi
done < <(git for-each-ref --format='%(refname:short)' refs/heads)
# Order bottom -> top by how many unmerged commits each branch carries.
mapfile -t stack < <(for b in "${stack[@]}"; do echo "$(unmerged "$b") $b"; done | sort -n | cut -d' ' -f2)

if [ "${#merged[@]}" -gt 0 ]; then
  echo "> already merged (safe to delete locally): ${merged[*]}"
fi
if [ "${#stack[@]}" -eq 0 ]; then
  echo "> nothing to restack: everything up to $top is already on main"
  exit 0
fi
echo "> stack (bottom -> top): ${stack[*]}"
git switch --quiet "$top"
echo "> rebasing onto origin/main (already-merged commits are skipped automatically)"
git rebase --update-refs origin/main

for b in "${stack[@]}"; do
  echo "  $b: $(git rev-list --count origin/main.."$b") commit(s) on top of main"
done

if [ "$checks" = 1 ]; then
  changed="$(git diff --name-only origin/main..."$top")"
  if grep -q '^backend/' <<<"$changed"; then
    echo "> backend checks"
    (cd backend && uv lock --check && uv sync --quiet && uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest -q)
  fi
  if grep -qE '^(frontend/|backend/openapi.json)' <<<"$changed"; then
    echo "> frontend checks"
    (cd frontend && pnpm install --frozen-lockfile --silent && pnpm -s typecheck && pnpm -s lint && pnpm -s test)
  fi
fi

if [ "$push" = 1 ]; then
  echo "> pushing: ${stack[*]}"
  git push --force-with-lease origin "${stack[@]}"
fi
echo "> done"
