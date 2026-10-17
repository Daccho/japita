FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.8.15 /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY japita ./japita
COPY tests/fixtures ./tests/fixtures
RUN uv sync --frozen --no-dev
EXPOSE 8000
CMD ["uv", "run", "--no-dev", "uvicorn", "japita.api:app", "--host", "0.0.0.0", "--port", "8000"]
