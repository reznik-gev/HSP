#!/usr/bin/env bash
# The weekly restore test (docs/0058, docs/0106, docs/0107, docs/0119). On a stack that
# `KEEP=1 deploy/test-bundle.sh` installed: seed data, back it up with `musical-chairs backup now`,
# wipe the database for a fresh stack, `musical-chairs restore`, and check that every Musical Chairs
# table and Keycloak's own data (users, realms, clients) have the same rows, and that signing in and
# finding the seeded seat still work. Then recover on a new host as install.md says: stop that
# installation, install again into a new folder with its saved secrets, copy the backup in, restore
# and check.
#   MUSICAL_CHAIRS_TEST_DIR=<test-bundle's directory> deploy/test-restore.sh
# Needs Docker with the Compose plugin, and pnpm with Playwright's Chromium in frontend/.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(realpath "${MUSICAL_CHAIRS_TEST_DIR:?set MUSICAL_CHAIRS_TEST_DIR to the directory test-bundle.sh used}")"
install="$tmp/install"
# The installation belongs to root, as musical-chairs install makes it (docs/0107).
as_root() { if [[ $EUID -eq 0 ]]; then "$@"; else sudo "$@"; fi; }
compose() { as_root docker compose --project-directory "$install" "$@"; }
healthy() { as_root "$install/bin/musical-chairs" wait; }

# The browser steps, against the installed stack.
drill() {
  (cd "$root/frontend" &&
    MUSICAL_CHAIRS_E2E_URL=https://localhost:8443 MUSICAL_CHAIRS_E2E_IGNORE_HTTPS_ERRORS=1 \
      pnpm exec playwright test -c e2e/restore-drill/playwright.config.ts "$1")
}

# counts <database> [tables]: "table|rows" for every table, or for those matching the pattern.
counts() {
  compose exec -T postgres psql -U postgres -d "$1" -tA -c "
    SELECT table_name || '|' || (xpath('/row/c/text()', query_to_xml(
      format('SELECT count(*) AS c FROM public.%I', table_name), false, true, '')))[1]::text
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name ~ '${2:-.}'
    ORDER BY table_name"
}
# Keycloak's own data: realms, clients, roles, users and their passwords. Not its runtime
# tables (cluster members, sessions), which a restart changes.
KEYCLOAK_TABLES='^(realm|client|keycloak_role|user_entity|credential|user_role_mapping)$'

# fresh: fail unless the installation's database lacks the seeded rows, or the test proves nothing.
fresh() {
  if [[ "$(counts musical_chairs)" == "$before_musical_chairs" ]]; then
    echo "FAIL: the fresh stack already has the seeded rows; the test would prove nothing" >&2
    exit 1
  fi
}

# restored: the seeded rows are back, and signing in and finding the seeded seat work.
restored() {
  if ! diff <(echo "$before_musical_chairs") <(counts musical_chairs) >&2; then
    echo "FAIL: Musical Chairs' tables differ after the restore (< before, > after)" >&2
    exit 1
  fi
  echo "ok: every Musical Chairs table has the same rows"
  if ! diff <(echo "$before_keycloak") <(counts keycloak "$KEYCLOAK_TABLES") >&2; then
    echo "FAIL: Keycloak's tables differ after the restore (< before, > after)" >&2
    exit 1
  fi
  echo "ok: Keycloak's realms, clients, roles, users and passwords have the same rows"
  drill check
}

echo "== Seed"
drill seed
before_musical_chairs="$(counts musical_chairs)"
before_keycloak="$(counts keycloak "$KEYCLOAK_TABLES")"

echo "== Back up"
backup="$(as_root "$install/bin/musical-chairs" backup now)"
echo "ok: $backup"

echo "== A fresh stack: the same installation with an empty database"
compose down --volumes
postgres_image="$(grep -o 'postgis/postgis:[^ ]*' "$install/compose.yml")"
docker run --rm -v "$tmp/data:/data" --entrypoint rm "$postgres_image" -rf /data/postgres
compose up -d
healthy
fresh

echo "== Restore $backup"
as_root "$install/bin/musical-chairs" restore "$backup" --yes
echo "== Check"
restored

echo "== Recover on a new host, as install.md says (docs/0119)"
# The old host is gone. What's left: a copy of its secrets/, its settings and the backup file.
as_root cp -a "$install/secrets" "$tmp/saved-secrets"
compose down
bundle="$(find "$tmp" -mindepth 1 -maxdepth 1 -type d -name 'musical-chairs-*')"
install="$tmp/new-host"
# The old host's settings, as test-bundle.sh installed it.
as_root "$bundle/bin/musical-chairs" install "$bundle" --dir "$install" --data-dir "$tmp/new-data" \
  --secrets "$tmp/saved-secrets" --no-admin \
  --public-url https://localhost:8443 --tls on --tls-cert "$tmp/tls.crt" --tls-key "$tmp/tls.key" \
  --set MUSICAL_CHAIRS_BIND_ADDRESS=127.0.0.1 --set MUSICAL_CHAIRS_HTTP_PORT=8088 --set MUSICAL_CHAIRS_HTTPS_PORT=8443 \
  --set MUSICAL_CHAIRS_API_WORKERS=2
fresh
as_root install -o 999 -m 640 "$tmp/data/backups/$backup" "$tmp/new-data/backups/"
as_root "$install/bin/musical-chairs" restore "$backup" --yes
echo "== Check the new host"
restored
echo "Restore test passed."
