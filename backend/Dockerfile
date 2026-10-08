# HSM API image (docs/0010, docs/0065). The same image runs the one-shot migrate job:
#   docker run ... hsm-api alembic upgrade head        (docs/0056)

FROM python:3.13-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never

# Dependencies first, for layer caching.
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project

COPY src ./src
COPY alembic.ini ./
COPY migrations ./migrations
RUN uv sync --frozen --no-dev

FROM python:3.13-slim
RUN useradd --system --uid 10001 --home-dir /app hsm
WORKDIR /app
COPY --from=build --chown=hsm:hsm /app /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1
USER hsm
EXPOSE 8000
CMD ["uvicorn", "hsm.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--workers", "4", "--proxy-headers"]
