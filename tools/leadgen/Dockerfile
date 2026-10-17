# Lead-gen pipeline. The Google Maps step runs gosom as a sibling container, so mount the
# host Docker socket and set LEADGEN_HOST_OUT_DIR (see README).
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.8.15 /uv /usr/local/bin/uv
RUN apt-get update && apt-get install -y --no-install-recommends docker.io ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project
COPY leadgen ./leadgen
COPY config.yaml ./
COPY seeds ./seeds
RUN uv sync --frozen --no-dev

RUN useradd --create-home leadgen && mkdir -p /app/out && chown leadgen /app/out
# Running as root is needed only to reach /var/run/docker.sock on some hosts; default to non-root.
USER leadgen
ENTRYPOINT ["uv", "run", "--no-sync", "python", "-m", "leadgen"]
CMD ["run", "--help"]
