#!/usr/bin/env bash
# The upgrade test (docs/0056, docs/0102, docs/0107): install the OLD bundle with its own
# hsp install, seed it, upgrade to the NEW bundle with the new release's hsp upgrade, and check
# the version and the seeded seat; then hsp rollback, and check them again.
#   HSP_TEST_DIR=<empty dir> deploy/test-upgrade.sh <old hsp-x.tar.gz> <new hsp-y.tar.gz>
# The release workflow runs it from the last published release. Needs what test-bundle.sh and
# test-restore.sh need.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
old="$(realpath "${1:?usage: deploy/test-upgrade.sh <old bundle> <new bundle>}")"
new="$(realpath "${2:?usage: deploy/test-upgrade.sh <old bundle> <new bundle>}")"
tmp="$(realpath "${HSP_TEST_DIR:?set HSP_TEST_DIR to an empty directory}")"
install="$tmp/install"
as_root() { if [[ $EUID -eq 0 ]]; then "$@"; else sudo "$@"; fi; }
compose() { as_root docker compose --project-directory "$install" "$@"; }

drill() {
  (cd "$root/frontend" &&
    HSP_E2E_URL=https://localhost:8443 HSP_E2E_IGNORE_HTTPS_ERRORS=1 \
      pnpm exec playwright test -c e2e/restore-drill/playwright.config.ts "$1")
}

# expect_version <version>: the API answers /readyz as ready, at that version.
expect_version() {
  local readyz
  readyz="$(compose exec -T api python -c \
    "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/readyz').read().decode())")"
  if [[ "$readyz" != *'"status":"ready"'* || "$readyz" != *"\"version\":\"$1\""* ]]; then
    echo "FAIL: expected HSP $1 to be ready, /readyz says: $readyz" >&2
    exit 1
  fi
  echo "ok: HSP $1 is ready"
}

version_of() { tar -xzOf "$1" --wildcards '*/VERSION'; }
from="$(version_of "$old")"
to="$(version_of "$new")"

echo "== Install $from"
KEEP=1 HSP_TEST_DIR="$tmp" "$root/deploy/test-bundle.sh" "$old"
drill seed

echo "== Upgrade to $to with its own hsp"
mkdir -p "$tmp/new"
tar -C "$tmp/new" -xzf "$new"
as_root "$tmp/new/hsp-$to/bin/hsp" upgrade --dir "$install" --yes
expect_version "$to"
drill check
if ! as_root "$install/bin/hsp" backup list | grep -q -- '-pre-upgrade\.tar'; then
  echo "FAIL: no pre-upgrade backup" >&2
  exit 1
fi
echo "ok: the pre-upgrade backup is kept"

echo "== Roll back to $from"
as_root "$install/bin/hsp" rollback --yes
expect_version "$from"
drill check
echo "Upgrade test $from -> $to passed."
