#!/bin/sh
# Writes the parts of Musical Chairs' nginx config that depend on the environment (docs/0098), then
# lets nginx's entrypoint start the server. Fails, and so stops the container, on a bad setting.
#
#   MUSICAL_CHAIRS_WEB_TLS              on (default): terminate TLS here; HTTP on 8080 redirects to
#                                       HTTPS on 8443. off: something in front terminates TLS; serve
#                                       HTTP on 8080.
#   MUSICAL_CHAIRS_PUBLIC_URL           https://musical-chairs.example.com, where users reach
#                                       Musical Chairs (needed when TLS is on).
#   MUSICAL_CHAIRS_TLS_CERT, _KEY       certificate and key files (TLS on).
#   MUSICAL_CHAIRS_HSTS                 on (default) / off. Sent only when TLS is on.
#   MUSICAL_CHAIRS_TRUSTED_PROXIES      TLS off: addresses or CIDRs of the proxy in front, whose
#                                       X-Forwarded-For/-Proto are trusted. Comma or space
#                                       separated.
#   MUSICAL_CHAIRS_KEYCLOAK_ADMIN_FROM  CIDRs that may reach Keycloak's admin console. Empty:
#                                       nobody.
#   MUSICAL_CHAIRS_API_UPSTREAM, MUSICAL_CHAIRS_KEYCLOAK_UPSTREAM
#                                       host:port of the API and Keycloak.
set -eu

fail() {
  echo "musical-chairs-web: $*" >&2
  exit 1
}

# list "a, b c" -> one item per line
list() {
  echo "$1" | tr ',' ' ' | tr -s ' ' '\n' | sed '/^$/d'
}

out=/etc/nginx/conf.d/musical_chairs
mkdir -p "$out"

printf 'set $musical_chairs_api http://%s;\nset $musical_chairs_keycloak http://%s;\n' \
  "$MUSICAL_CHAIRS_API_UPSTREAM" "$MUSICAL_CHAIRS_KEYCLOAK_UPSTREAM" > "$out/upstreams.inc"

if [ -z "${MUSICAL_CHAIRS_KEYCLOAK_ADMIN_FROM:-}" ]; then
  echo "return 404;" > "$out/keycloak-admin.inc"
else
  {
    for cidr in $(list "$MUSICAL_CHAIRS_KEYCLOAK_ADMIN_FROM"); do echo "allow $cidr;"; done
    echo "deny all;"
  } > "$out/keycloak-admin.inc"
fi

servers=/etc/nginx/conf.d/musical-chairs-servers.conf
case "${MUSICAL_CHAIRS_WEB_TLS:-on}" in
  on)
    case "${MUSICAL_CHAIRS_PUBLIC_URL:-}" in
      https://*) ;;
      *) fail "MUSICAL_CHAIRS_WEB_TLS=on needs MUSICAL_CHAIRS_PUBLIC_URL=https://<host>" ;;
    esac
    [ -r "$MUSICAL_CHAIRS_TLS_CERT" ] || fail "no certificate at MUSICAL_CHAIRS_TLS_CERT=$MUSICAL_CHAIRS_TLS_CERT"
    [ -r "$MUSICAL_CHAIRS_TLS_KEY" ] || fail "no key at MUSICAL_CHAIRS_TLS_KEY=$MUSICAL_CHAIRS_TLS_KEY"
    hsts=""
    [ "${MUSICAL_CHAIRS_HSTS:-on}" = on ] && hsts="max-age=31536000"
    cat > "$servers" <<CONF
# MUSICAL_CHAIRS_WEB_TLS=on: written by 40-musical_chairs.sh.
server {
    listen 8080;
    location / {
        return 301 ${MUSICAL_CHAIRS_PUBLIC_URL%/}\$request_uri;
    }
}

server {
    listen 8443 ssl;
    http2 on;
    ssl_certificate $MUSICAL_CHAIRS_TLS_CERT;
    ssl_certificate_key $MUSICAL_CHAIRS_TLS_KEY;
    include /etc/nginx/musical_chairs/tls.conf;

    set \$musical_chairs_hsts "$hsts";
    set \$musical_chairs_forwarded_proto https;
    include /etc/nginx/musical_chairs/app.conf;
}
CONF
    ;;
  off)
    {
      echo "# MUSICAL_CHAIRS_WEB_TLS=off: written by 40-musical_chairs.sh."
      echo "geo \$realip_remote_addr \$musical_chairs_from_trusted_proxy {"
      echo "    default 0;"
      for cidr in $(list "${MUSICAL_CHAIRS_TRUSTED_PROXIES:-}"); do echo "    $cidr 1;"; done
      echo "}"
      echo "# The scheme the user's browser used, if the proxy in front says so and is trusted."
      echo "map \"\$musical_chairs_from_trusted_proxy:\$http_x_forwarded_proto\" \$musical_chairs_forwarded_proto {"
      echo "    \"~^1:(?<proto>https?)\$\" \$proto;"
      echo "    default \$scheme;"
      echo "}"
      echo "server {"
      echo "    listen 8080;"
      for cidr in $(list "${MUSICAL_CHAIRS_TRUSTED_PROXIES:-}"); do echo "    set_real_ip_from $cidr;"; done
      echo "    real_ip_header X-Forwarded-For;"
      echo "    real_ip_recursive on;"
      echo "    set \$musical_chairs_hsts \"\";"
      echo "    include /etc/nginx/musical_chairs/app.conf;"
      echo "}"
    } > "$servers"
    ;;
  *)
    fail "MUSICAL_CHAIRS_WEB_TLS must be on or off, not '$MUSICAL_CHAIRS_WEB_TLS'"
    ;;
esac
