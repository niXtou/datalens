# DataLens

Upload a CSV → a LangGraph agent profiles it and runs scikit-learn analyses (clustering, regression, classification, anomaly detection, correlation) → results stream to a React dashboard over SSE.

**[Live demo](https://datalens.nstoug.com)** · ![CI](https://github.com/niXtou/datalens/actions/workflows/ci.yml/badge.svg)

---

## What it is

A small project built to explore three things in one stack: LangGraph for agentic workflows, FastAPI's SSE for live streaming, and OpenAPI-driven type generation between Python and TypeScript. The agent inspects an uploaded CSV's column types, picks which scikit-learn tools to run, executes them, and streams each step back to the browser as it happens.

---

## Architecture

```
POST /upload          CSV → column-type inference + per-column profile → file_id
POST /analyse/{id}    Runs the LangGraph agent, streams steps via SSE
GET  /results/{id}    Typed results + LLM summary
GET  /health          Liveness
```

`POST /analyse/{id}` body (all optional):

| Field | Type | Notes |
|---|---|---|
| `analyses` | `string[]` | Explicit tool list; skips the LLM planner. Omit to let the agent decide. |
| `target_column` | `string` | Regression target. Default: last continuous numeric column. |
| `classification_target` | `string` | Classification target. Default: first class-label column. |
| `force` | `bool` | Re-run even when results already exist. |

The upload response carries a small data profile per column — missing %, unique count, and mean/std/min/max, top values or date range depending on type — which the frontend shows as a table before you pick analyses.

```
Browser
  └── React + Recharts
        ├── Upload + column profile table
        ├── SSE log of agent steps
        └── Results tabs (summary / clustering / regression / classification / anomaly / correlation)

FastAPI
  └── LangGraph agent
        ├── infer_columns   — pandas dtype → ColumnType
        ├── plan_analyses   — LLM picks tools based on column schema
        ├── run_tool        — KMeans · LinearRegression · RandomForest · IsolationForest · Pearson
        └── summarize       — LLM plain-English summary
```

---

## Stack

| Layer | Choice |
|---|---|
| Backend | FastAPI · Pydantic v2 · Python 3.13 |
| Agent | LangGraph (state graph, conditional edges) |
| ML | scikit-learn (KMeans, LinearRegression, RandomForestClassifier, IsolationForest, Pearson correlation) |
| LLM | OpenRouter → Gemini Flash Lite (configurable via `LLM_MODEL`) |
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

`test_data/wine.csv` (UCI wine, 178 rows, `wine_class` label) is the classification demo; `boston_housing.csv` suits regression.

CI runs both on every push (see `.github/workflows/ci.yml`).

---

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | yes | LLM routing via [openrouter.ai](https://openrouter.ai) |
| `LLM_MODEL` | no | OpenRouter model id (default `google/gemini-3.1-flash-lite-preview`) |
| `LANGSMITH_API_KEY` | no | Enables LangSmith tracing |
| `LANGSMITH_TRACING` | no | `true` to activate (default `false`) |
| `LANGSMITH_PROJECT` | no | Project name in LangSmith |
| `ENVIRONMENT` | no | `development` or `production` |

---

## License

MIT
