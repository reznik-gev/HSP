# Musical Chairs backup image (docs/0058, docs/0106): musical-chairs-backup with PostgreSQL 18's
# client tools. Build: deploy/build-images.sh, or
#   docker build --build-context backup=backup -t musical-chairs-backup deploy/backup

FROM python:3.14-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
COPY --from=backup pyproject.toml uv.lock README.md ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project
COPY --from=backup src ./src
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev

FROM python:3.14-slim
ARG MUSICAL_CHAIRS_VERSION=0.0.0-dev
ARG MUSICAL_CHAIRS_REVISION=unknown
ARG MUSICAL_CHAIRS_CREATED=unknown
LABEL org.opencontainers.image.title="musical-chairs-backup" \
      org.opencontainers.image.description="Musical Chairs backup service: scheduled dumps to a folder or S3, and restore" \
      org.opencontainers.image.source="https://github.com/reznik-gev/MusicalChairs" \
      org.opencontainers.image.version="${MUSICAL_CHAIRS_VERSION}" \
      org.opencontainers.image.revision="${MUSICAL_CHAIRS_REVISION}" \
      org.opencontainers.image.created="${MUSICAL_CHAIRS_CREATED}"
# pg_dump and pg_restore must be at least the server's version (postgis/postgis:18), so they come
# from the PostgreSQL project's own Debian repository. Debian's security fixes are installed too,
# even those the base image doesn't have yet (docs/0129). Musical Chairs never runs pip (the app is
# in /app/.venv, built by uv), and pip's own bundled packages carry known vulnerabilities, so it is
# removed.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSo /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
       https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    && . /etc/os-release \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
       > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y \
    && apt-get install -y --no-install-recommends postgresql-client-18 \
    && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/local/bin/pip* /usr/local/lib/python3*/ensurepip \
       /usr/local/lib/python3*/site-packages/pip /usr/local/lib/python3*/site-packages/pip-*.dist-info
# Runs as uid 999, the postgres container's user, so it can read the superuser's password file
# (secrets/db_superuser_password belongs to 999) and the backups folder belongs to it too.
RUN useradd --system --uid 999 --home-dir /app musical-chairs-backup
WORKDIR /app
COPY --from=build --chown=999:999 /app /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 MUSICAL_CHAIRS_VERSION="${MUSICAL_CHAIRS_VERSION}"
USER 999
EXPOSE 9465
CMD ["musical-chairs-backup", "serve"]
