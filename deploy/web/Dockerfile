# HSP web image: nginx with the built frontend inside (docs/0060, docs/0097).
# The frontend comes in as a second build context:
#   docker build --build-context frontend=frontend -t hsp-web deploy/web
# or deploy/build-images.sh. Settings come from the environment, read by the templates/ at start.

FROM node:24-slim AS build
WORKDIR /src
# pnpm in the version package.json names (packageManager), via corepack.
RUN corepack enable
COPY --from=frontend package.json pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY --from=frontend . .
RUN pnpm build

FROM nginxinc/nginx-unprivileged:1.30
ARG HSP_VERSION=0.0.0-dev
ARG HSP_REVISION=unknown
ARG HSP_CREATED=unknown
LABEL org.opencontainers.image.title="hsp-web" \
      org.opencontainers.image.description="HSP frontend served by nginx" \
      org.opencontainers.image.source="https://github.com/reznik-gev/HSP" \
      org.opencontainers.image.version="${HSP_VERSION}" \
      org.opencontainers.image.revision="${HSP_REVISION}" \
      org.opencontainers.image.created="${HSP_CREATED}"
# The image's own default site is replaced by ours (templates/ -> /etc/nginx/conf.d at start).
RUN rm /etc/nginx/conf.d/default.conf
COPY templates/ /etc/nginx/templates/
COPY --from=build /src/dist /usr/share/nginx/html
ENV HSP_VERSION="${HSP_VERSION}"
# 8080: the app. 8081: health, internal only (docs/0097).
EXPOSE 8080 8081
