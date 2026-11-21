#!/usr/bin/env bash
# The upgrade test (docs/0056, docs/0102, docs/0107): install the OLD bundle with its own
# musical-chairs install, seed it, upgrade to the NEW bundle with the new release's musical-chairs upgrade, and check
# the version and the seeded seat; then musical-chairs rollback, and check them again.
#   MUSICAL_CHAIRS_TEST_DIR=<empty dir> deploy/test-upgrade.sh <old musical-chairs-x.tar.gz> <new musical-chairs-y.tar.gz>
# The release workflow runs it from the last published release. Needs what test-bundle.sh and
# test-restore.sh need.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
old="$(realpath "${1:?usage: deploy/test-upgrade.sh <old bundle> <new bundle>}")"
new="$(realpath "${2:?usage: deploy/test-upgrade.sh <old bundle> <new bundle>}")"
tmp="$(realpath "${MUSICAL_CHAIRS_TEST_DIR:?set MUSICAL_CHAIRS_TEST_DIR to an empty directory}")"
install="$tmp/install"
as_root() { if [[ $EUID -eq 0 ]]; then "$@"; else sudo "$@"; fi; }
compose() { as_root docker compose --project-directory "$install" "$@"; }

drill() {
  (cd "$root/frontend" &&
    MUSICAL_CHAIRS_E2E_URL=https://localhost:8443 MUSICAL_CHAIRS_E2E_IGNORE_HTTPS_ERRORS=1 \
      pnpm exec playwright test -c e2e/restore-drill/playwright.config.ts "$1")
}

# expect_version <version>: the API answers /readyz as ready, at that version.
expect_version() {
  local readyz
  readyz="$(compose exec -T api python -c \
    "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/readyz').read().decode())")"
  if [[ "$readyz" != *'"status":"ready"'* || "$readyz" != *"\"version\":\"$1\""* ]]; then
    echo "FAIL: expected Musical Chairs $1 to be ready, /readyz says: $readyz" >&2
    exit 1
  fi
  echo "ok: Musical Chairs $1 is ready"
}

version_of() { tar -xzOf "$1" --wildcards '*/VERSION'; }
from="$(version_of "$old")"
to="$(version_of "$new")"

echo "== Install $from"
KEEP=1 MUSICAL_CHAIRS_TEST_DIR="$tmp" "$root/deploy/test-bundle.sh" "$old"
drill seed

echo "== Upgrade to $to with its own musical-chairs"
mkdir -p "$tmp/new"
tar -C "$tmp/new" -xzf "$new"
as_root "$tmp/new/musical-chairs-$to/bin/musical-chairs" upgrade --dir "$install" --yes
expect_version "$to"
drill check
if ! as_root "$install/bin/musical-chairs" backup list | grep -q -- '-pre-upgrade\.tar'; then
  echo "FAIL: no pre-upgrade backup" >&2
  exit 1
fi
echo "ok: the pre-upgrade backup is kept"

echo "== Roll back to $from"
as_root "$install/bin/musical-chairs" rollback --yes
expect_version "$from"
drill check
echo "Upgrade test $from -> $to passed."
