# DataLens

Upload a CSV → a LangGraph agent runs scikit-learn analyses → results stream to a React dashboard over SSE.

**[Live demo](https://datalens.nstoug.com)** · ![CI](https://github.com/niXtou/datalens/actions/workflows/ci.yml/badge.svg)

---

## What it is

A small project built to explore three things in one stack: LangGraph for agentic workflows, FastAPI's SSE for live streaming, and OpenAPI-driven type generation between Python and TypeScript. The agent inspects an uploaded CSV's column types, picks which scikit-learn tools to run, executes them, and streams each step back to the browser as it happens.

---

## Architecture

```
POST /upload          CSV → column-type inference → file_id
POST /analyse/{id}    Runs the LangGraph agent, streams steps via SSE
GET  /results/{id}    Typed results + LLM summary
GET  /health          Liveness
```

```
Browser
  └── React + Recharts
        ├── Upload + column preview
        ├── SSE log of agent steps
        └── Results tabs (clustering / regression / anomaly / summary)

FastAPI
  └── LangGraph agent
        ├── infer_columns   — pandas dtype → ColumnType
        ├── plan_analyses   — LLM picks tools based on column schema
        ├── run_tool        — KMeans · LinearRegression · IsolationForest
        └── summarize       — LLM plain-English summary
```

---

## Stack

| Layer | Choice |
|---|---|
| Backend | FastAPI · Pydantic v2 · Python 3.13 |
| Agent | LangGraph (state graph, conditional edges) |
| ML | scikit-learn (KMeans, LinearRegression, IsolationForest) |
| LLM | OpenRouter → Gemini Flash Lite |
| Streaming | SSE (`text/event-stream`) |
| Frontend | React 19 · TypeScript · Recharts · Tailwind |
| Tooling | `uv` · `pnpm` · Ruff · Vitest |
| Infra | Docker · GitHub Actions → ARM64 VPS |

TypeScript types in the frontend are generated from the FastAPI OpenAPI schema (`pnpm codegen`) — not hand-written.

---

## Local development

Requires Python 3.13+ with [`uv`](https://docs.astral.sh/uv/) and Node 22+ with [`pnpm`](https://pnpm.io/).

```bash
cp .env.example .env   # add your OPENROUTER_API_KEY
```

```bash
# Terminal 1 — backend on :8000
cd backend && uv sync && uv run uvicorn datalens_ai.main:app --reload

# Terminal 2 — frontend on :5173
cd frontend && pnpm install && pnpm dev
```

Or run the full prod stack in Docker:

```bash
docker compose --profile prod up --build
```

---

## Tests

```bash
cd backend && uv run pytest --cov=datalens_ai
cd frontend && pnpm test
```

CI runs both on every push (see `.github/workflows/ci.yml`).

---

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | yes | LLM routing via [openrouter.ai](https://openrouter.ai) |
| `LANGSMITH_API_KEY` | no | Enables LangSmith tracing |
| `LANGSMITH_TRACING` | no | `true` to activate (default `false`) |
| `LANGSMITH_PROJECT` | no | Project name in LangSmith |
| `ENVIRONMENT` | no | `development` or `production` |

---

## License

MIT
