# HSP web image: nginx with the built frontend inside, and HSP's one entry point (docs/0060,
# docs/0097, docs/0098). The frontend comes in as a second build context:
#   docker build --build-context frontend=frontend -t hsp-web deploy/web
# or deploy/build-images.sh. Settings come from the environment: see docker-entrypoint.d/40-hsp.sh.

FROM node:24-slim AS build
WORKDIR /src
# pnpm in the version package.json names (packageManager), via corepack.
RUN corepack enable
COPY --from=frontend package.json pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY --from=frontend . .
# The app shows the release in its user menu (docs/0104).
ARG HSP_VERSION=0.0.0-dev
RUN HSP_VERSION="${HSP_VERSION}" pnpm build
# Compressed once here, served as is (gzip_static), so no CPU is spent per request (docs/0098).
RUN find dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.svg' \
      -o -name '*.json' \) -size +1k -exec gzip -k -9 {} +

FROM nginxinc/nginx-unprivileged:1.30
ARG HSP_VERSION=0.0.0-dev
ARG HSP_REVISION=unknown
ARG HSP_CREATED=unknown
LABEL org.opencontainers.image.title="hsp-web" \
      org.opencontainers.image.description="HSP frontend and entry point (nginx)" \
      org.opencontainers.image.source="https://github.com/reznik-gev/HSP" \
      org.opencontainers.image.version="${HSP_VERSION}" \
      org.opencontainers.image.revision="${HSP_REVISION}" \
      org.opencontainers.image.created="${HSP_CREATED}"
# The image's own default site is replaced by ours (templates/ -> /etc/nginx/conf.d at start).
RUN rm /etc/nginx/conf.d/default.conf
COPY templates/ /etc/nginx/templates/
COPY hsp/ /etc/nginx/hsp/
COPY html/ /usr/share/nginx/hsp/
COPY --chmod=755 docker-entrypoint.d/40-hsp.sh /docker-entrypoint.d/
COPY --from=build /src/dist /usr/share/nginx/html
ENV HSP_VERSION="${HSP_VERSION}" \
    HSP_WEB_TLS=on \
    HSP_PUBLIC_URL="" \
    HSP_TLS_CERT=/etc/hsp/tls/tls.crt \
    HSP_TLS_KEY=/etc/hsp/tls/tls.key \
    HSP_HSTS=on \
    HSP_TRUSTED_PROXIES="" \
    HSP_KEYCLOAK_ADMIN_FROM="" \
    HSP_API_UPSTREAM=api:8000 \
    HSP_KEYCLOAK_UPSTREAM=keycloak:8080 \
    HSP_RESOLVER=127.0.0.11
# 8080: HTTP (the app, or a redirect to HTTPS). 8443: HTTPS. 8081: health, internal only.
EXPOSE 8080 8443 8081
