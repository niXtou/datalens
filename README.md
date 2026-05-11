# DataLens

Upload a CSV → LangGraph agent runs ML analyses → React dashboard streams live results.

![CI](https://github.com/niXtou/datalens-ai/actions/workflows/ci.yml/badge.svg)

---

## Architecture

```
POST /upload          CSV → column type inference → file_id
POST /analyse/{id}    Starts LangGraph agent, streams steps via SSE
GET  /results/{id}    Returns full typed results + LLM summary
GET  /health          Liveness check
```

```
Browser
  └── React + Recharts
        ├── Upload → column preview
        ├── SSE stream → live agent log
        └── Results dashboard (tabs: clustering / regression / anomaly / summary)

FastAPI (async)
  └── LangGraph agent
        ├── infer_columns   — pandas dtype → ColumnType
        ├── plan_analyses   — LLM selects tools based on column schema
        ├── run_tool        — KMeans · LinearRegression · IsolationForest
        └── summarize       — LLM plain-English summary
```

## Stack

| Layer | Choice |
|---|---|
| Backend | FastAPI + Pydantic v2 + LangGraph |
| ML | Scikit-learn (KMeans, LinearRegression, IsolationForest) |
| LLM | OpenRouter → Gemini Flash Lite |
| Streaming | SSE (`text/event-stream`) |
| Frontend | React + TypeScript + Recharts |
| Infra | Docker Compose · GitHub Actions CI |

---

## Local development

### Prerequisites

- Python 3.13+, [uv](https://docs.astral.sh/uv/)
- Node 22+, [pnpm](https://pnpm.io/)

### Setup

```bash
cp .env.example .env        # fill in OPENROUTER_API_KEY
```

```bash
# Terminal 1 — backend
cd backend && uv sync && uv run uvicorn datalens_ai.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — frontend
cd frontend && pnpm install && pnpm dev --host 0.0.0.0
```

Frontend: `http://localhost:3000` · API: `http://localhost:8000`

> **WSL2 note:** Run services directly rather than via Docker Compose — native Docker Engine in WSL2 mirrored-mode does not bridge ports to Windows reliably.

---

## Production (Docker)

```bash
docker compose --profile prod up --build
```

Frontend served by nginx on `:80`, API on `:8000`.

---

## Tests

```bash
# Backend (94% coverage)
cd backend && uv run pytest --cov=datalens_ai

# Frontend
cd frontend && pnpm test
```

CI runs both on every push via GitHub Actions.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes | Routes LLM calls via [openrouter.ai](https://openrouter.ai) |
| `LANGSMITH_API_KEY` | No | Enables LangSmith agent tracing |
| `LANGSMITH_TRACING` | No | Set `true` to activate tracing (default: false) |
| `LANGSMITH_PROJECT` | No | Project name in LangSmith dashboard |
| `ENVIRONMENT` | No | `development` or `production` (default: development) |
