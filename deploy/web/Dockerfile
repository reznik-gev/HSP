# Musical Chairs web image: nginx with the built frontend inside, and Musical Chairs' one entry
# point (docs/0060, docs/0097, docs/0098). The frontend comes in as a second build context:
#   docker build --build-context frontend=frontend -t musical-chairs-web deploy/web
# or deploy/build-images.sh. Settings come from the environment: see
# docker-entrypoint.d/40-musical-chairs.sh.

FROM node:24-slim AS build
WORKDIR /src
# pnpm in the version package.json names (packageManager), via corepack.
RUN corepack enable
COPY --from=frontend package.json pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY --from=frontend . .
# The app shows the release in its user menu (docs/0104).
ARG MUSICAL_CHAIRS_VERSION=0.0.0-dev
RUN MUSICAL_CHAIRS_VERSION="${MUSICAL_CHAIRS_VERSION}" pnpm build
# Compressed once here, served as is (gzip_static), so no CPU is spent per request (docs/0098).
RUN find dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.svg' \
      -o -name '*.json' \) -size +1k -exec gzip -k -9 {} +

FROM nginxinc/nginx-unprivileged:1.31
ARG MUSICAL_CHAIRS_VERSION=0.0.0-dev
ARG MUSICAL_CHAIRS_REVISION=unknown
ARG MUSICAL_CHAIRS_CREATED=unknown
LABEL org.opencontainers.image.title="musical-chairs-web" \
      org.opencontainers.image.description="Musical Chairs frontend and entry point (nginx)" \
      org.opencontainers.image.source="https://github.com/reznik-gev/MusicalChairs" \
      org.opencontainers.image.version="${MUSICAL_CHAIRS_VERSION}" \
      org.opencontainers.image.revision="${MUSICAL_CHAIRS_REVISION}" \
      org.opencontainers.image.created="${MUSICAL_CHAIRS_CREATED}"
# The image's own default site is replaced by ours (templates/ -> /etc/nginx/conf.d at start).
RUN rm /etc/nginx/conf.d/default.conf
# Debian's security fixes, even those the base image doesn't have yet (docs/0129). The image runs
# as nginx (uid 101), so this step switches to root and back.
USER root
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/*
USER 101
COPY templates/ /etc/nginx/templates/
COPY musical_chairs/ /etc/nginx/musical_chairs/
COPY html/ /usr/share/nginx/musical_chairs/
COPY --chmod=755 docker-entrypoint.d/40-musical-chairs.sh /docker-entrypoint.d/
COPY --from=build /src/dist /usr/share/nginx/html
ENV MUSICAL_CHAIRS_VERSION="${MUSICAL_CHAIRS_VERSION}" \
    MUSICAL_CHAIRS_WEB_TLS=on \
    MUSICAL_CHAIRS_PUBLIC_URL="" \
    MUSICAL_CHAIRS_TLS_CERT=/etc/musical_chairs/tls/tls.crt \
    MUSICAL_CHAIRS_TLS_KEY=/etc/musical_chairs/tls/tls.key \
    MUSICAL_CHAIRS_HSTS=on \
    MUSICAL_CHAIRS_TRUSTED_PROXIES="" \
    MUSICAL_CHAIRS_KEYCLOAK_ADMIN_FROM="" \
    MUSICAL_CHAIRS_API_UPSTREAM=api:8000 \
    MUSICAL_CHAIRS_KEYCLOAK_UPSTREAM=keycloak:8080 \
    MUSICAL_CHAIRS_RESOLVER=127.0.0.11
# 8080: HTTP (the app, or a redirect to HTTPS). 8443: HTTPS. 8081: health, internal only.
EXPOSE 8080 8443 8081
