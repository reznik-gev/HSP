#!/bin/bash
# Loads secrets from files, then starts Keycloak (docs/0099). For every variable NAME_FILE, the
# file's content becomes NAME, as the postgres image does: e.g. KC_DB_PASSWORD_FILE=/run/secrets/x
# sets KC_DB_PASSWORD. Keycloak itself has no *_FILE support.
set -euo pipefail

while IFS='=' read -r name path; do
  target="${name%_FILE}"
  [ -r "$path" ] || { echo "hsp-keycloak: can't read $name=$path" >&2; exit 1; }
  export "$target=$(cat "$path")"
done < <(env | grep -E '^[A-Z0-9_]+_FILE=' || true)

exec /opt/keycloak/bin/kc.sh "$@"
