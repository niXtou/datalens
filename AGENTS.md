# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Cursor, etc.) working in this repo. See `README.md` for the project pitch.

## Project overview

DataLens is a FastAPI + LangGraph agent that runs scikit-learn analyses on uploaded CSVs and streams results to a React frontend via SSE. Monorepo with `backend/` (Python 3.13) and `frontend/` (React 19 + TypeScript). No database — results are held in-memory per request. Status: feature-complete, live at `datalens.nstoug.com`.

## Setup

```bash
# Backend
cd backend
uv sync --extra dev                  # installs runtime + dev deps (uv, NOT pip)

# Frontend
cd frontend
pnpm install                          # uses pnpm, NOT npm
```

Environment: copy `.env.example` to `.env` and set `OPENROUTER_API_KEY` at minimum.

## Run

```bash
# Backend on :8000
cd backend && uv run uvicorn datalens_ai.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend on :5173
cd frontend && pnpm dev --host 0.0.0.0

# Full stack via Docker (prod profile)
docker compose --profile prod up --build
```

Note: dev runs services directly on the host. Docker Compose has WSL2 port-bridging issues for dev workflows.

## Test

```bash
# Backend — must pass before committing
cd backend && uv run ruff check src/ && uv run pytest --cov=datalens_ai --cov-fail-under=70

# Frontend
cd frontend && pnpm exec tsc -b && pnpm lint && pnpm test
```

CI runs the same commands on every push (see `.github/workflows/deploy.yml`).

## Code style

### Python (`backend/`)

- **Lint/format**: Ruff (replaces black, isort, flake8). Config in `pyproject.toml`. Line length 100, target `py313`.
- **Types**: All public functions get type hints on params and return values.
- **Async**: Use `async`/`await` throughout — endpoints are async.
- **Pydantic v2 only**: `model_validator`, `field_validator`, `ConfigDict`. No v1 `@validator` patterns.
- **LangChain imports**: always from `langchain_core` (e.g. `from langchain_core.messages import HumanMessage`), never the top-level `langchain` package.

### TypeScript (`frontend/`)

- Strict mode. No `any`.
- Functional components with hooks. Named exports.
- Tailwind for styling.
- **Never hand-write API types** — they're generated from FastAPI's OpenAPI schema via `pnpm codegen`. If backend models change, regenerate before touching frontend types.

## Project layout

```
backend/src/datalens_ai/
├── main.py              # FastAPI app + lifespan
├── api/                 # Route handlers
├── agent/               # LangGraph graph + node functions
├── tools/               # scikit-learn wrappers: clustering (KMeans), regression (LinearRegression),
│                        #   classification (RandomForest), anomaly (IsolationForest), correlation (Pearson)
├── models/              # Pydantic v2 — single source of truth for TS codegen
└── config.py            # Pydantic Settings (env vars)

frontend/src/
├── components/          # React UI
├── lib/                 # SSE client, API client
└── types/               # Generated from OpenAPI — do not edit by hand
```

Key files to read first: `backend/src/datalens_ai/agent/graph.py` (graph assembly), `backend/src/datalens_ai/models/` (data shape).

## Conventions

- **Streaming**: SSE (`text/event-stream`) via FastAPI, not WebSockets.
- **LLM**: All calls go through OpenRouter via `langchain-openrouter`. Don't import provider SDKs directly.
- **LangGraph state**: `AgentState` (TypedDict) with `csv_path`, `column_types`, `analyses_requested`, `results`, `stream_log`, plus optional `analyses_override`, `target_column` (regression) and `classification_target`. Each node is a function returning a partial state dict.
- **Tools**: `TOOLS` in `agent/graph.py` maps `run_clustering`, `run_regression`, `run_classification`, `run_anomaly`, `run_correlation` to `tools/*.py`. Each takes a DataFrame and returns a Pydantic result in the `AnalysisResult` union; raise `ValueError` for "can't run on this data" — `run_tool` turns it into a skipped step, never a crash. Add new array-valued result fields to `_ARRAY_FIELDS` so they stay out of the summary prompt.
- **Planner guardrails**: the LLM plan is filtered in code (`_filter_by_prerequisites`) — classification needs a `class_label` column, correlation needs ≥2 numeric columns. The explicit `analyses` override from the UI bypasses the planner entirely.
- **Summary fallback**: if the LLM call in `summarize` fails, the node logs a warning and returns `summary=""` with a "Summary unavailable" stream step. Tool results are still persisted and shown; the frontend simply hides the Summary tab.
- **Settings**: `OPENROUTER_API_KEY` (required), `LLM_MODEL` (OpenRouter model id, default `google/gemini-3.1-flash-lite-preview`), `MAX_UPLOAD_BYTES`, `FILE_RETENTION_HOURS`, `CORS_ORIGINS`, LangSmith vars. See `config.py`.
- **No secrets in code**: env vars only, via Pydantic Settings.
- **Library docs**: use `context7` MCP for current LangGraph / FastAPI / Pydantic / OpenRouter docs — training data may be stale.

## Commit conventions

Format: `type(scope): description`

Types: `feat`, `fix`, `docs`, `chore`, `test`, `refactor`. Keep commits small and focused — one concern per commit.

## What to confirm before doing

- Adding or removing dependencies (`uv add`, `pnpm add`)
- Modifying `compose.yaml`, `docker-compose.prod.yml`, or any `Dockerfile`
- Modifying anything in `.github/workflows/`
- Git operations beyond `status` / `diff` / `log` (especially `commit`, `push`, branch switches)
- Deleting files
