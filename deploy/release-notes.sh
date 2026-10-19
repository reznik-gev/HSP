#!/usr/bin/env bash
# Print one version's section of CHANGELOG.md, without its heading (docs/0102). Fails if the
# section is missing or empty, so a release can't go out without notes.
#   deploy/release-notes.sh 1.2.0        # the "## [1.2.0] - <date>" section
#   deploy/release-notes.sh Unreleased   # the "## [Unreleased]" section (dry runs)
set -euo pipefail

version="${1:?usage: deploy/release-notes.sh <version|Unreleased>}"
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
  echo "FAIL: CHANGELOG.md has no '## [$version]' section, or it's empty (docs/guides/releasing.md)" >&2
  exit 1
fi
printf '%s\n' "$notes"
