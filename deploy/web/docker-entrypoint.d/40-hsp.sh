#!/bin/sh
# Writes the parts of HSP's nginx config that depend on the environment (docs/0098), then lets
# nginx's entrypoint start the server. Fails, and so stops the container, on a bad setting.
#
#   HSP_WEB_TLS              on (default): terminate TLS here; HTTP on 8080 redirects to HTTPS on
#                            8443. off: something in front terminates TLS; serve HTTP on 8080.
#   HSP_PUBLIC_URL           https://hsp.example.com, where users reach HSP (needed when TLS is on).
#   HSP_TLS_CERT, _KEY       certificate and key files (TLS on).
#   HSP_HSTS                 on (default) / off. Sent only when TLS is on.
#   HSP_TRUSTED_PROXIES      TLS off: addresses or CIDRs of the proxy in front, whose
#                            X-Forwarded-For/-Proto are trusted. Comma or space separated.
#   HSP_KEYCLOAK_ADMIN_FROM  CIDRs that may reach Keycloak's admin console. Empty: nobody.
#   HSP_API_UPSTREAM, HSP_KEYCLOAK_UPSTREAM   host:port of the API and Keycloak.
set -eu

fail() {
  echo "hsp-web: $*" >&2
  exit 1
}

# list "a, b c" -> one item per line
list() {
  echo "$1" | tr ',' ' ' | tr -s ' ' '\n' | sed '/^$/d'
}

out=/etc/nginx/conf.d/hsp
mkdir -p "$out"

printf 'set $hsp_api http://%s;\nset $hsp_keycloak http://%s;\n' \
  "$HSP_API_UPSTREAM" "$HSP_KEYCLOAK_UPSTREAM" > "$out/upstreams.inc"

if [ -z "${HSP_KEYCLOAK_ADMIN_FROM:-}" ]; then
  echo "return 404;" > "$out/keycloak-admin.inc"
else
  {
    for cidr in $(list "$HSP_KEYCLOAK_ADMIN_FROM"); do echo "allow $cidr;"; done
    echo "deny all;"
  } > "$out/keycloak-admin.inc"
fi

servers=/etc/nginx/conf.d/hsp-servers.conf
case "${HSP_WEB_TLS:-on}" in
  on)
    case "${HSP_PUBLIC_URL:-}" in
      https://*) ;;
      *) fail "HSP_WEB_TLS=on needs HSP_PUBLIC_URL=https://<host>" ;;
    esac
    [ -r "$HSP_TLS_CERT" ] || fail "no certificate at HSP_TLS_CERT=$HSP_TLS_CERT"
    [ -r "$HSP_TLS_KEY" ] || fail "no key at HSP_TLS_KEY=$HSP_TLS_KEY"
    hsts=""
    [ "${HSP_HSTS:-on}" = on ] && hsts="max-age=31536000"
    cat > "$servers" <<CONF
# HSP_WEB_TLS=on: written by 40-hsp.sh.
server {
    listen 8080;
    location / {
        return 301 ${HSP_PUBLIC_URL%/}\$request_uri;
    }
}

server {
    listen 8443 ssl;
    http2 on;
    ssl_certificate $HSP_TLS_CERT;
    ssl_certificate_key $HSP_TLS_KEY;
    include /etc/nginx/hsp/tls.conf;

    set \$hsp_hsts "$hsts";
    set \$hsp_forwarded_proto https;
    include /etc/nginx/hsp/app.conf;
}
CONF
    ;;
  off)
    {
      echo "# HSP_WEB_TLS=off: written by 40-hsp.sh."
      echo "geo \$realip_remote_addr \$hsp_from_trusted_proxy {"
      echo "    default 0;"
      for cidr in $(list "${HSP_TRUSTED_PROXIES:-}"); do echo "    $cidr 1;"; done
      echo "}"
      echo "# The scheme the user's browser used, if the proxy in front says so and is trusted."
      echo "map \"\$hsp_from_trusted_proxy:\$http_x_forwarded_proto\" \$hsp_forwarded_proto {"
      echo "    \"~^1:(?<proto>https?)\$\" \$proto;"
      echo "    default \$scheme;"
      echo "}"
      echo "server {"
      echo "    listen 8080;"
      for cidr in $(list "${HSP_TRUSTED_PROXIES:-}"); do echo "    set_real_ip_from $cidr;"; done
      echo "    real_ip_header X-Forwarded-For;"
      echo "    real_ip_recursive on;"
      echo "    set \$hsp_hsts \"\";"
      echo "    include /etc/nginx/hsp/app.conf;"
      echo "}"
    } > "$servers"
    ;;
  *)
    fail "HSP_WEB_TLS must be on or off, not '$HSP_WEB_TLS'"
    ;;
esac
