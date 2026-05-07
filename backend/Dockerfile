FROM python:3.13-slim
WORKDIR /app
RUN pip install uv
COPY backend/pyproject.toml /app/pyproject.toml
COPY backend/uv.lock /app/uv.lock
RUN uv sync --frozen
COPY backend/src /app/src
CMD ["uv", "run", "uvicorn", "datalens_ai.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
