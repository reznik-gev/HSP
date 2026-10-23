#!/usr/bin/env bash
# Install a release bundle the way deploy/README.md describes, start it, and check it (docs/0102).
# The release workflow runs it on a clean runner, then runs the Playwright tests against the stack.
#   deploy/test-bundle.sh dist/hsp-1.2.0.tar.gz          # check, then stop and remove everything
#   KEEP=1 deploy/test-bundle.sh dist/hsp-1.2.0.tar.gz   # leave the stack running for Playwright
# HSP_TEST_DIR=<empty dir> puts the unpacked bundle and the installation there (default: a new
# temporary directory); the stack's Compose project is then <dir>/install.
# The stack listens on 127.0.0.1:8088 (HTTP) and :8443 (HTTPS, a self-signed certificate) as
# https://localhost:8443, with test users admin/admin (hsp-admin) and viewer/viewer.
# Needs Linux, Docker with the Compose plugin, curl, openssl and python3.
set -euo pipefail

bundle="$(realpath "${1:?usage: deploy/test-bundle.sh <hsp-version.tar.gz>}")"
url=https://localhost:8443
tmp="${HSP_TEST_DIR:-$(mktemp -d)}"
mkdir -p "$tmp"
tmp="$(realpath "$tmp")"
install="$tmp/install"
postgres_image=""

compose() { docker compose --project-directory "$install" "$@"; }

cleanup() {
  if [[ "${KEEP:-}" == 1 ]]; then
    echo "KEEP=1: the stack is still running from $install"
    return
  fi
  compose down --volumes >/dev/null 2>&1 || true
  # PostgreSQL's data belongs to its container's user; remove it as root, inside a container.
  if [[ -n "$postgres_image" ]]; then
    docker run --rm -v "$tmp:/t" --entrypoint rm "$postgres_image" -rf /t/data 2>/dev/null || true
  fi
  rm -rf "$tmp"
}
trap cleanup EXIT

# expect <what> <text> <needle>
expect() {
  if [[ "$2" != *"$3"* ]]; then
    echo "FAIL: $1: expected to contain '$3', got: $2" >&2
    exit 1
  fi
  echo "ok: $1"
}

# status <curl options and URL>: the HTTP status (and redirect target), without the body.
status() {
  curl -sS -w '\n%{http_code} %{redirect_url}' "$@" | tail -n 1
}

echo "== Unpack and verify"
if [[ -f "$bundle.sha256" ]]; then
  (cd "$(dirname "$bundle")" && sha256sum -c "$(basename "$bundle").sha256")
fi
tar -C "$tmp" -xzf "$bundle"
dir="$(find "$tmp" -mindepth 1 -maxdepth 1 -type d -name 'hsp-*')"
(cd "$dir" && sha256sum --quiet -c SHA256SUMS) && echo "ok: SHA256SUMS"
version="$(cat "$dir/VERSION")"
for image in "$dir"/images/*.tar; do
  docker load -q -i "$image"
done
postgres_image="$(grep -o 'postgis/postgis:[^ ]*' "$dir/compose/compose.yml")"

echo "== Install $version as deploy/README.md describes"
mkdir -p "$install/secrets" "$install/tls" "$tmp/data"
cp "$dir/compose/compose.yml" "$install/"
cp -r "$dir/compose/postgres-init" "$install/"
cp "$dir/compose/.env.example" "$install/.env"
# set_env <name> <value>: change a setting in .env, as an operator would.
set_env() { sed -i "s|^$1=.*|$1=$2|" "$install/.env"; grep -q "^$1=$2\$" "$install/.env"; }
set_env HSP_PUBLIC_URL "$url"
set_env HSP_DATA_DIR "$tmp/data"
set_env HSP_BIND_ADDRESS 127.0.0.1
set_env HSP_HTTP_PORT 8088
set_env HSP_HTTPS_PORT 8443
set_env HSP_API_WORKERS 2
for s in db_superuser_password hsp_database_password keycloak_db_password \
  keycloak_admin_password hsp_oidc_client_secret; do
  openssl rand -base64 32 | tr -d '/+=\n' > "$install/secrets/$s"
done
python3 -c "import base64,os; print(base64.urlsafe_b64encode(os.urandom(32)).decode(), end='')" \
  > "$install/secrets/hsp_session_encryption_key"
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj /CN=localhost \
  -addext subjectAltName=DNS:localhost \
  -keyout "$install/tls/tls.key" -out "$install/tls/tls.crt" 2>/dev/null
# A throwaway runner: readable by every container user, in place of the per-user owners the
# README sets up.
chmod 444 "$install"/secrets/* "$install"/tls/*

echo "== Start"
compose up -d || { compose ps -a >&2; compose logs --tail 80 >&2; exit 1; }
# Wait until every service is healthy and migrate has finished. No service names or count here,
# so a service added to compose.yml is waited for too.
healthy=""
for _ in $(seq 60); do
  states="$(compose ps -a --format '{{.Service}}={{.State}}/{{.Health}}/{{.ExitCode}}')"
  if [[ "$states" == *"migrate=exited//0"* ]] &&
    ! grep -v '^migrate=' <<<"$states" | grep -qv '=running/healthy/'; then
    healthy=1
    break
  fi
  if grep -qE '=exited//[1-9]|=running/unhealthy/' <<<"$states"; then break; fi
  sleep 5
done
if [[ -z "$healthy" ]]; then
  echo "FAIL: the stack didn't become healthy:" >&2
  compose ps -a >&2
  compose logs --tail 80 >&2
  exit 1
fi
echo "ok: every service is healthy and migrations ran"

echo "== Check"
expect "the app loads over HTTPS" "$(curl -fsSk "$url/")" '<div id="root">'
expect "HTTP redirects to HTTPS" "$(status http://localhost:8088/floors)" "301 $url/floors"
headers="$(curl -fsSkI "$url/" | tr "[:upper:]" "[:lower:]")"
expect "the app sends the content security policy" "$headers" "frame-ancestors 'none'"
expect "the app sends HSTS" "$headers" "strict-transport-security: max-age="
# The answer's body, even a 503's, so a failure says which check wasn't ready.
readyz="$(compose exec -T api python -c "
import urllib.error, urllib.request
try: print(urllib.request.urlopen('http://localhost:8000/readyz').read().decode())
except urllib.error.HTTPError as e: print(e.code, e.read().decode())")"
expect "the API is ready" "$readyz" '"status":"ready"'
expect "the API runs this release" "$readyz" "\"version\":\"$version\""
expect "the API refuses requests without sign-in" "$(status -k "$url/api/v1/auth/me")" "401"
expect "Keycloak names the public URL as its issuer" \
  "$(curl -fsSk "$url/auth/realms/hsp/.well-known/openid-configuration")" \
  "\"issuer\":\"$url/auth/realms/hsp\""
expect "Keycloak's admin console is closed" "$(status -k "$url/auth/admin/")" "404"

echo "== Test users for the browser tests"
compose exec -T keycloak bash -s <<EOF
set -e
k=/opt/keycloak/bin/kcadm.sh
\$k config credentials --server http://localhost:8080/auth --realm master --user admin \
  --password "\$(cat /run/secrets/keycloak_admin_password)" >/dev/null
for u in admin viewer; do
  \$k create users -r hsp -s username=\$u -s email=\$u@hsp.test -s firstName=Test \
    -s lastName=\$u -s enabled=true -s emailVerified=true >/dev/null
  \$k set-password -r hsp --username \$u --new-password \$u
done
\$k add-roles -r hsp --uusername admin --rolename hsp-admin
EOF
echo "ok: admin/admin and viewer/viewer can sign in"
echo "Bundle $version passed."
