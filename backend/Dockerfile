# HSP API image (docs/0010, docs/0065, docs/0097). The same image runs the one-shot migrate job:
#   docker run ... hsp-api alembic upgrade head        (docs/0056)
# Build: deploy/build-images.sh, or docker build --build-arg HSP_VERSION=1.2.0 -t hsp-api backend

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
ARG HSP_VERSION=0.0.0-dev
ARG HSP_REVISION=unknown
ARG HSP_CREATED=unknown
LABEL org.opencontainers.image.title="hsp-api" \
      org.opencontainers.image.description="HSP API (FastAPI) and its migrate job" \
      org.opencontainers.image.source="https://github.com/reznik-gev/HSP" \
      org.opencontainers.image.version="${HSP_VERSION}" \
      org.opencontainers.image.revision="${HSP_REVISION}" \
      org.opencontainers.image.created="${HSP_CREATED}"
RUN useradd --system --uid 10001 --home-dir /app hsp
WORKDIR /app
COPY --from=build --chown=hsp:hsp /app /app
# hsp-api (hsp/serve.py) serves the metrics port, then runs the uvicorn workers. The API port is
# never published: only hsp-web (or an ingress) reaches it, so uvicorn may trust X-Forwarded-* from
# any address on the container network (docs/0097). The API logs each request as JSON itself
# (docs/0105), so uvicorn's own access log is off: it would repeat them as plain text, sign-in
# codes in callback URLs included. Workers write metrics to PROMETHEUS_MULTIPROC_DIR, which exists
# for every process (the migrate job too) and is emptied each time the API starts.
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 \
    HSP_VERSION="${HSP_VERSION}" HSP_ENVIRONMENT=production \
    HSP_API_WORKERS=4 FORWARDED_ALLOW_IPS="*" PROMETHEUS_MULTIPROC_DIR=/tmp/hsp-metrics
RUN install -d -o 10001 -g 10001 /tmp/hsp-metrics
USER 10001
EXPOSE 8000 9464
CMD ["hsp-api"]
