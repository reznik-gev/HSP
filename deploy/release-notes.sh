#!/usr/bin/env bash
# Print one version's section of CHANGELOG.md, without its heading (docs/0102). Fails if the
# section is missing or empty, so a release can't go out without notes.
#   deploy/release-notes.sh 1.2.0                       # the "## [1.2.0] - <date>" section
#   deploy/release-notes.sh Unreleased                  # the "## [Unreleased]" section
#   deploy/release-notes.sh --not-a-release Unreleased  # for a bundle that's never published
# --not-a-release prints a placeholder line instead of failing. Dry runs, the restore drill and
# the sizing bench use it: right after a release PR, Unreleased is empty until the next line.
set -euo pipefail

placeholder=false
if [[ "${1:-}" == --not-a-release ]]; then
  placeholder=true
  shift
fi
version="${1:?usage: deploy/release-notes.sh [--not-a-release] <version|Unreleased>}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

notes="$(
  awk -v v="$version" '
    /^## \[/ { if (found) exit; found = index($0, "## [" v "]") == 1; next }
    found
  ' "$root/CHANGELOG.md"
)"
# Trim blank lines at both ends.
notes="$(printf '%s\n' "$notes" | sed -e '/./,$!d' | tac | sed -e '/./,$!d' | tac)"

if [[ -z "$notes" ]]; then
  if [[ "$placeholder" == true ]]; then
    echo "No notes yet: not a release."
    exit 0
  fi
  echo "FAIL: CHANGELOG.md has no '## [$version]' section, or it's empty (docs/guides/releasing.md)" >&2
  exit 1
fi
printf '%s\n' "$notes"
