#!/usr/bin/env bash
# Install a release bundle with its own musical-chairs install, as deploy/install.md describes, and
# check it (docs/0102, docs/0107). The release workflow runs it on a clean runner, then runs the
# Playwright tests against the stack.
#   deploy/test-bundle.sh dist/musical-chairs-1.2.0.tar.gz          # check, then remove everything
#   KEEP=1 deploy/test-bundle.sh dist/musical-chairs-1.2.0.tar.gz   # keep the stack for Playwright
# MUSICAL_CHAIRS_TEST_DIR=<empty dir> puts the unpacked bundle and the installation there (default:
# a new temporary directory); the stack's Compose project is then <dir>/install. The stack listens
# on 127.0.0.1:8088 (HTTP) and :8443 (HTTPS, a self-signed certificate) as https://localhost:8443,
# with test users admin/admin (musical-chairs-admin) and viewer/viewer. Needs Linux, Docker with the
# Compose plugin, curl, openssl, and root or sudo.
set -euo pipefail

bundle="$(realpath "${1:?usage: deploy/test-bundle.sh <musical-chairs-version.tar.gz>}")"
url=https://localhost:8443
tmp="${MUSICAL_CHAIRS_TEST_DIR:-$(mktemp -d)}"
mkdir -p "$tmp"
tmp="$(realpath "$tmp")"
install="$tmp/install"

# The installation belongs to root, as musical-chairs install makes it; secrets/ is root's only.
as_root() { if [[ $EUID -eq 0 ]]; then "$@"; else sudo "$@"; fi; }
compose() { as_root docker compose --project-directory "$install" "$@"; }

cleanup() {
  if [[ "${KEEP:-}" == 1 ]]; then
    echo "KEEP=1: the stack is still running from $install"
    return
  fi
  compose down --volumes >/dev/null 2>&1 || true
  as_root rm -rf "$tmp"
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
dir="$(find "$tmp" -mindepth 1 -maxdepth 1 -type d -name 'musical-chairs-*')"
(cd "$dir" && sha256sum --quiet -c SHA256SUMS) && echo "ok: SHA256SUMS"
version="$(cat "$dir/VERSION")"

echo "== Install $version with musical-chairs install (docs/0107)"
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj /CN=localhost \
  -addext subjectAltName=DNS:localhost -keyout "$tmp/tls.key" -out "$tmp/tls.crt" 2>/dev/null
# The test users come below, so no first admin.
as_root "$dir/bin/musical-chairs" install "$dir" --dir "$install" --data-dir "$tmp/data" \
  --public-url "$url" --tls on --tls-cert "$tmp/tls.crt" --tls-key "$tmp/tls.key" --no-admin \
  --set MUSICAL_CHAIRS_BIND_ADDRESS=127.0.0.1 --set MUSICAL_CHAIRS_HTTP_PORT=8088 --set MUSICAL_CHAIRS_HTTPS_PORT=8443 \
  --set MUSICAL_CHAIRS_API_WORKERS=2
expect "musical-chairs install copies itself into the installation" "$(ls "$install/bin")" "musical-chairs"
expect "musical-chairs status names the release" "$(as_root "$install/bin/musical-chairs" status)" "Musical Chairs $version at $url"

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
  "$(curl -fsSk "$url/auth/realms/musical_chairs/.well-known/openid-configuration")" \
  "\"issuer\":\"$url/auth/realms/musical_chairs\""
expect "Keycloak's admin console is closed" "$(status -k "$url/auth/admin/")" "404"
expect "backups.yml is fine" "$(compose exec -T backup musical-chairs-backup check)" "every target can be read"
backup="$(compose exec -T backup musical-chairs-backup now)"
expect "a backup is written to MUSICAL_CHAIRS_DATA_DIR/backups" "$(as_root ls "$tmp/data/backups")" "$backup"
expect "the backup holds both databases" "$(as_root tar -tf "$tmp/data/backups/$backup")" "keycloak.dump"

echo "== Test users for the browser tests"
compose exec -T keycloak bash -s <<EOF
set -e
k=/opt/keycloak/bin/kcadm.sh
\$k config credentials --server http://localhost:8080/auth --realm master --user admin \
  --password "\$(cat /run/secrets/keycloak_admin_password)" >/dev/null
for u in admin viewer; do
  \$k create users -r musical_chairs -s username=\$u -s email=\$u@musical-chairs.test -s firstName=Test \
    -s lastName=\$u -s enabled=true -s emailVerified=true >/dev/null
  \$k set-password -r musical_chairs --username \$u --new-password \$u
done
\$k add-roles -r musical_chairs --uusername admin --rolename musical-chairs-admin
EOF
echo "ok: admin/admin and viewer/viewer can sign in"
echo "Bundle $version passed."
