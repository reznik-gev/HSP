#!/usr/bin/env bash
# Smoke-test the HSP images built by deploy/build-images.sh (docs/0097). CI runs it on PRs.
#   deploy/smoke-images.sh [version]      # default 0.0.0-dev
# Checks that each image starts and answers: the API's /healthz and its migrate tooling, the web
# image's app and health ports, and Keycloak starting optimized against PostgreSQL with the realm
# imported. Ports 18000-18082 and 19000 on this machine must be free.
set -euo pipefail

version="${1:-0.0.0-dev}"
run="hsp-smoke-$$"
net="$run-net"

cleanup() {
  docker rm -f "$run-api" "$run-web" "$run-db" "$run-kc" >/dev/null 2>&1 || true
  docker network rm "$net" >/dev/null 2>&1 || true
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

docker network create "$net" >/dev/null

echo "== hsp-api"
docker run -d --name "$run-api" -p 18000:8000 \
  -e HSP_SESSION_ENCRYPTION_KEY="$(head -c 32 /dev/urandom | base64 | tr '+/' '-_')" \
  -e HSP_OIDC_CLIENT_SECRET=smoke-secret \
  -e HSP_API_WORKERS=2 \
  "hsp-api:$version" >/dev/null
wait_for http://localhost:18000/healthz 60 || { docker logs "$run-api"; exit 1; }
expect "api /healthz reports the version" "$(curl -fsS http://localhost:18000/healthz)" "\"version\":\"$version\""
expect "api runs as non-root" "$(docker exec "$run-api" id -u)" "10001"
expect "migrate job has the migrations" "$(docker run --rm "hsp-api:$version" alembic heads)" "(head)"

echo "== hsp-web"
docker run -d --name "$run-web" -p 18080:8080 -p 18081:8081 "hsp-web:$version" >/dev/null
wait_for http://localhost:18081/healthz 30 || { docker logs "$run-web"; exit 1; }
expect "web /healthz reports the version" "$(curl -fsS http://localhost:18081/healthz)" "\"version\":\"$version\""
expect "web serves the app" "$(curl -fsS http://localhost:18080/)" '<div id="root">'
expect "web serves client routes from index.html" "$(curl -fsS http://localhost:18080/floors/x)" '<div id="root">'
expect "web never caches index.html" "$(curl -fsSI http://localhost:18080/)" "no-cache"
expect "web runs as non-root" "$(docker exec "$run-web" id -u)" "101"

echo "== hsp-keycloak"
docker run -d --name "$run-db" --network "$net" \
  -e POSTGRES_USER=keycloak -e POSTGRES_PASSWORD=keycloak -e POSTGRES_DB=keycloak \
  postgis/postgis:18-3.6 >/dev/null
for _ in $(seq 60); do
  docker exec "$run-db" pg_isready -U keycloak -d keycloak >/dev/null 2>&1 && break
  sleep 1
done
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
