# Musical Chairs API image (docs/0010, docs/0065, docs/0097). The same image runs the one-shot
# migrate job:
#   docker run ... musical-chairs-api alembic upgrade head        (docs/0056)
# Build: deploy/build-images.sh, or
#   docker build --build-arg MUSICAL_CHAIRS_VERSION=1.2.0 -t musical-chairs-api backend

FROM python:3.14-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never

# Dependencies first, for layer caching.
COPY pyproject.toml uv.lock README.md ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project

COPY src ./src
COPY alembic.ini ./
COPY migrations ./migrations
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev

FROM python:3.14-slim
ARG MUSICAL_CHAIRS_VERSION=0.0.0-dev
ARG MUSICAL_CHAIRS_REVISION=unknown
ARG MUSICAL_CHAIRS_CREATED=unknown
LABEL org.opencontainers.image.title="musical-chairs-api" \
      org.opencontainers.image.description="Musical Chairs API (FastAPI) and its migrate job" \
      org.opencontainers.image.source="https://github.com/reznik-gev/MusicalChairs" \
      org.opencontainers.image.version="${MUSICAL_CHAIRS_VERSION}" \
      org.opencontainers.image.revision="${MUSICAL_CHAIRS_REVISION}" \
      org.opencontainers.image.created="${MUSICAL_CHAIRS_CREATED}"
# Debian's security fixes, even those the base image doesn't have yet (docs/0129). Musical Chairs
# never runs pip (the app is in /app/.venv, built by uv), and pip's own bundled packages carry known
# vulnerabilities, so it is removed.
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/local/bin/pip* /usr/local/lib/python3*/ensurepip \
       /usr/local/lib/python3*/site-packages/pip /usr/local/lib/python3*/site-packages/pip-*.dist-info
RUN useradd --system --uid 10001 --home-dir /app musical_chairs
WORKDIR /app
COPY --from=build --chown=musical_chairs:musical_chairs /app /app
# musical-chairs-api (musical_chairs/serve.py) serves the metrics port, then runs the uvicorn
# workers. The API port is never published: only musical-chairs-web (or an ingress) reaches it, so
# uvicorn may trust X-Forwarded-* from any address on the container network (docs/0097). The API
# logs each request as JSON itself (docs/0105), so uvicorn's own access log is off: it would repeat
# them as plain text, sign-in codes in callback URLs included. Workers write metrics to
# PROMETHEUS_MULTIPROC_DIR, which exists for every process (the migrate job too) and is emptied each
# time the API starts.
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 \
    MUSICAL_CHAIRS_VERSION="${MUSICAL_CHAIRS_VERSION}" MUSICAL_CHAIRS_ENVIRONMENT=production \
    MUSICAL_CHAIRS_API_WORKERS=4 FORWARDED_ALLOW_IPS="*" PROMETHEUS_MULTIPROC_DIR=/tmp/musical-chairs-metrics
RUN install -d -o 10001 -g 10001 /tmp/musical-chairs-metrics
USER 10001
EXPOSE 8000 9464
CMD ["musical-chairs-api"]
