#!/usr/bin/env bash
# Smoke-test the HSP images built by deploy/build-images.sh (docs/0097). CI runs it on PRs.
#   deploy/smoke-images.sh [version]      # default 0.0.0-dev
# Checks that each image starts and answers: the API's /healthz, its migrate tooling and its
# refusal to start on an unmigrated database; the web
# image in both TLS modes (docs/0098), serving the app, proxying to the API and closing Keycloak's
# admin console; and Keycloak starting optimized against PostgreSQL with the realm imported.
# Ports 18000-18088, 18443 and 19000 on this machine must be free; needs curl and openssl.
set -euo pipefail

version="${1:-0.0.0-dev}"
run="hsp-smoke-$$"
net="$run-net"
tmp="$(mktemp -d)"
tls="$tmp/tls"
mkdir "$tls"

cleanup() {
  docker rm -f "$run-api" "$run-web" "$run-web-tls" "$run-db" "$run-kc" >/dev/null 2>&1 || true
  docker network rm "$net" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

# wait_for <url> <seconds>: until the URL answers 2xx.
wait_for() {
  for _ in $(seq "$2"); do
    curl -fsS "$1" >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "FAIL: no answer from $1 within $2 s" >&2
  return 1
}

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

docker network create "$net" >/dev/null

# One PostgreSQL for the API and Keycloak, each with its own database.
docker run -d --name "$run-db" --network "$net" \
  -e POSTGRES_USER=keycloak -e POSTGRES_PASSWORD=keycloak -e POSTGRES_DB=keycloak \
  postgis/postgis:18-3.6 >/dev/null
# The image's init scripts restart the server once, so wait for it to answer over the network.
for _ in $(seq 60); do
  docker exec "$run-db" pg_isready -h "$run-db" -U keycloak -d keycloak >/dev/null 2>&1 && break
  sleep 1
done
docker exec -e PGPASSWORD=keycloak "$run-db" createdb -h "$run-db" -U keycloak hsp

echo "== hsp-api"
api_env=(
  -e HSP_DATABASE_URL="postgresql+asyncpg://keycloak:keycloak@$run-db:5432/hsp"
  -e HSP_SESSION_ENCRYPTION_KEY="$(head -c 32 /dev/urandom | base64 | tr '+/' '-_')"
  -e HSP_OIDC_CLIENT_SECRET=smoke-secret
  -e HSP_API_WORKERS=2
)
expect "api refuses to start before migrations ran (docs/0056)" \
  "$(timeout 60 docker run --rm --network "$net" "${api_env[@]}" "hsp-api:$version" 2>&1 || true)" \
  "run the migrate job"
docker run --rm --network "$net" "${api_env[@]}" "hsp-api:$version" alembic upgrade head >/dev/null
docker run -d --name "$run-api" --network "$net" --network-alias api -p 18000:8000 \
  "${api_env[@]}" "hsp-api:$version" >/dev/null
wait_for http://localhost:18000/healthz 60 || { docker logs "$run-api"; exit 1; }
expect "api /healthz reports the version" "$(curl -fsS http://localhost:18000/healthz)" "\"version\":\"$version\""
expect "api runs as non-root" "$(docker exec "$run-api" id -u)" "10001"
expect "migrate job has the migrations" "$(docker run --rm "hsp-api:$version" alembic heads)" "(head)"

echo "== hsp-web, HSP_WEB_TLS=off (behind a trusted proxy)"
docker run -d --name "$run-web" --network "$net" -p 18080:8080 -p 18081:8081 \
  -e HSP_WEB_TLS=off -e HSP_TRUSTED_PROXIES=0.0.0.0/0 "hsp-web:$version" >/dev/null
wait_for http://localhost:18081/healthz 30 || { docker logs "$run-web"; exit 1; }
expect "web /healthz reports the version" "$(curl -fsS http://localhost:18081/healthz)" "\"version\":\"$version\""
expect "web serves the app" "$(curl -fsS http://localhost:18080/)" '<div id="root">'
expect "web serves client routes from index.html" "$(curl -fsS http://localhost:18080/floors/x)" '<div id="root">'
headers="$(curl -fsSI http://localhost:18080/)"
expect "web never caches index.html" "$headers" "no-cache"
expect "web sends the content security policy" "$headers" "frame-ancestors 'none'"
[[ "$headers" != *Strict-Transport-Security* ]] || { echo "FAIL: HSTS sent without TLS" >&2; exit 1; }
echo "ok: no HSTS without TLS"
asset="$(curl -fsS http://localhost:18080/ | grep -o -m1 '/assets/index-[^"]*\.js')"
expect "web serves assets gzipped" \
  "$(curl -fsSI -H 'Accept-Encoding: gzip' "http://localhost:18080$asset")" "Content-Encoding: gzip"
expect "web proxies /api to the API" \
  "$(curl -sS -H 'X-Request-ID: smoke-1' -D - http://localhost:18080/api/v1/auth/me)" "x-request-id: smoke-1"
expect "web closes Keycloak's admin console" \
  "$(status http://localhost:18080/auth/admin/)" "404"
expect "web shows the maintenance page while Keycloak is down" \
  "$(curl -sS -w ' status=%{http_code}' http://localhost:18080/auth/realms/hsp/account)" "status=503"
docker stop -t 2 "$run-api" >/dev/null
expect "web answers a Problem Details 503 while the API is down" \
  "$(curl -sS -w ' status=%{http_code}' http://localhost:18080/api/v1/floors)" "problems/maintenance"
docker start "$run-api" >/dev/null
expect "web runs as non-root" "$(docker exec "$run-web" id -u)" "101"

echo "== hsp-web, HSP_WEB_TLS=on"
# Relative paths: Git for Windows' openssl doesn't understand /tmp.
(cd "$tls" && openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=localhost" \
  -keyout tls.key -out tls.crt 2>/dev/null)
chmod 644 "$tls/tls.key"  # test key only: readable by nginx's user after docker cp
docker create --name "$run-web-tls" --network "$net" -p 18088:8080 -p 18443:8443 \
  -e HSP_PUBLIC_URL=https://localhost:18443 -e HSP_KEYCLOAK_ADMIN_FROM=10.99.0.0/16 \
  -e HSP_TLS_CERT=/tmp/tls/tls.crt -e HSP_TLS_KEY=/tmp/tls/tls.key "hsp-web:$version" >/dev/null
# Streamed as a tar, so it works the same from Git Bash on Windows.
tar -C "$tmp" -cf - tls | docker cp - "$run-web-tls:/tmp"
docker start "$run-web-tls" >/dev/null
for _ in $(seq 30); do curl -ksS https://localhost:18443/ >/dev/null 2>&1 && break; sleep 1; done
expect "web redirects HTTP to the public HTTPS address" \
  "$(status 'http://localhost:18088/floors?x=1')" \
  "301 https://localhost:18443/floors?x=1"
headers="$(curl -ksSI https://localhost:18443/ | tr '[:upper:]' '[:lower:]')"
expect "web serves the app over HTTPS" "$headers" " 200"
expect "web sends HSTS for this host only" "$headers" "strict-transport-security: max-age=31536000"
# Older protocols are off in tls.conf; current curl builds can't even offer them, so only
# check that TLS 1.2 clients still get in.
expect "web accepts TLS 1.2" "$(status -k --tlsv1.2 --tls-max 1.2 https://localhost:18443/)" "200"
expect "web limits Keycloak's admin console to HSP_KEYCLOAK_ADMIN_FROM" \
  "$(status -k https://localhost:18443/auth/admin/)" "403"
expect "web refuses to start with TLS on and no certificate" \
  "$(docker run --rm -e HSP_PUBLIC_URL=https://x "hsp-web:$version" 2>&1 || true)" "no certificate"

echo "== hsp-keycloak"
docker run -d --name "$run-kc" --network "$net" -p 18082:8080 -p 19000:9000 \
  -e KC_DB_URL="jdbc:postgresql://$run-db:5432/keycloak" \
  -e KC_DB_USERNAME=keycloak -e KC_DB_PASSWORD=keycloak \
  -e KC_HOSTNAME=http://localhost:18082/auth -e KC_HTTP_ENABLED=true \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  -e HSP_PUBLIC_URL=https://hsp.example -e HSP_OIDC_CLIENT_SECRET=smoke-secret \
  "hsp-keycloak:$version" >/dev/null
wait_for http://localhost:19000/auth/health/ready 180 || { docker logs "$run-kc"; exit 1; }
echo "ok: keycloak is ready"
# Without --optimized (or with build options changed at start) Keycloak rebuilds itself first.
if docker logs "$run-kc" 2>&1 | grep -q "Updating the configuration"; then
  echo "FAIL: keycloak rebuilt itself at start instead of starting optimized" >&2
  exit 1
fi
echo "ok: keycloak started optimized"
expect "keycloak imported the hsp realm" \
  "$(curl -fsS http://localhost:18082/auth/realms/hsp/.well-known/openid-configuration)" \
  '"issuer":"http://localhost:18082/auth/realms/hsp"'
# The bootstrap admin can sign in a moment after Keycloak reports ready.
token=""
for _ in $(seq 30); do
  token="$(curl -fsS http://localhost:18082/auth/realms/master/protocol/openid-connect/token \
    -d grant_type=password -d client_id=admin-cli -d username=admin -d password=admin \
    2>/dev/null | sed -E 's/.*"access_token":"([^"]+)".*/\1/')" && break
  sleep 1
done
expect "keycloak filled the realm's placeholders from the environment" \
  "$(curl -fsS -H "Authorization: Bearer $token" \
    'http://localhost:18082/auth/admin/realms/hsp/clients?clientId=hsp-api')" \
  '"redirectUris":["https://hsp.example/api/v1/auth/callback"]'

echo "All image smoke checks passed."
