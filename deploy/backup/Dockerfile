# HSP backup image (docs/0058, docs/0106): hsp-backup with PostgreSQL 18's client tools.
# Build: deploy/build-images.sh, or
#   docker build --build-context backup=backup -t hsp-backup deploy/backup

FROM python:3.14-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
COPY --from=backup pyproject.toml uv.lock README.md ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project
COPY --from=backup src ./src
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev

FROM python:3.14-slim
ARG HSP_VERSION=0.0.0-dev
ARG HSP_REVISION=unknown
ARG HSP_CREATED=unknown
LABEL org.opencontainers.image.title="hsp-backup" \
      org.opencontainers.image.description="HSP backup service: scheduled dumps to a folder or S3, and restore" \
      org.opencontainers.image.source="https://github.com/reznik-gev/HSP" \
      org.opencontainers.image.version="${HSP_VERSION}" \
      org.opencontainers.image.revision="${HSP_REVISION}" \
      org.opencontainers.image.created="${HSP_CREATED}"
# pg_dump and pg_restore must be at least the server's version (postgis/postgis:18), so they
# come from the PostgreSQL project's own Debian repository.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSo /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
       https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    && . /etc/os-release \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
       > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-18 \
    && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
# Runs as uid 999, the postgres container's user, so it can read the superuser's password file
# (secrets/db_superuser_password belongs to 999) and the backups folder belongs to it too.
RUN useradd --system --uid 999 --home-dir /app hsp-backup
WORKDIR /app
COPY --from=build --chown=999:999 /app /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 HSP_VERSION="${HSP_VERSION}"
USER 999
EXPOSE 9465
CMD ["hsp-backup", "serve"]
