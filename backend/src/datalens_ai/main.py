from dotenv import load_dotenv
load_dotenv()

import asyncio  # noqa: E402
from contextlib import asynccontextmanager  # noqa: E402

from fastapi import FastAPI, Response  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from datalens_ai.api.upload import router as upload_router  # noqa: E402
from datalens_ai.api.analyse import router as analyse_router  # noqa: E402
from datalens_ai.api.cleanup import cleanup_loop  # noqa: E402
from datalens_ai.config import settings  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Background TTL sweep for stale uploads/results (see api/cleanup.py).
    task = asyncio.create_task(cleanup_loop())
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload_router)
app.include_router(analyse_router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.head("/health")
async def health_check_head() -> Response:
    return Response(status_code=200)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
