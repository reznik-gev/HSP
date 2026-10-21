#!/usr/bin/env bash
# Wait until every service of an installed stack is healthy and migrate has finished, for the
# bundle and restore tests (docs/0102, docs/0106). No service names or count here, so a service
# added to compose.yml is waited for too. On failure it shows the states and the logs.
#   deploy/wait-healthy.sh <installation directory>
set -euo pipefail

install="${1:?usage: deploy/wait-healthy.sh <installation directory>}"
compose() { docker compose --project-directory "$install" "$@"; }

for _ in $(seq 60); do
  states="$(compose ps -a --format '{{.Service}}={{.State}}/{{.Health}}/{{.ExitCode}}')"
  if [[ "$states" == *"migrate=exited//0"* ]] &&
    ! grep -v '^migrate=' <<<"$states" | grep -qv '=running/healthy/'; then
    echo "ok: every service is healthy and migrations ran"
    exit 0
  fi
  if grep -qE '=exited//[1-9]|=running/unhealthy/' <<<"$states"; then break; fi
  sleep 5
done
echo "FAIL: the stack didn't become healthy:" >&2
compose ps -a >&2
compose logs --tail 80 >&2
exit 1
