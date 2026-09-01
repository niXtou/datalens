import asyncio
import json
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from datalens_ai.agent.graph import agent
from datalens_ai.api.upload import resolve_csv_path
from datalens_ai.models.results import ResultsResponse


class AnalyseRequest(BaseModel):
    analyses: list[str] | None = None
    target_column: str | None = None
    classification_target: str | None = None
    force: bool = False  # re-run even when results already exist

results_store: dict[str, dict] = {}
_background_tasks: set[asyncio.Task] = set()

_RESULTS_DIR = Path(tempfile.gettempdir()) / "datalens_ai_results"
_RESULTS_DIR.mkdir(exist_ok=True)

router = APIRouter()


def _persist(file_id: str, data: dict) -> None:
    payload = {
        "results": {k: v.model_dump() for k, v in data["results"].items()},
        "summary": data["summary"],
    }
    (_RESULTS_DIR / f"{file_id}.json").write_text(json.dumps(payload))


def _load_from_disk(file_id: str) -> ResultsResponse | None:
    path = _RESULTS_DIR / f"{file_id}.json"
    if not path.exists():
        return None
    return ResultsResponse.model_validate(json.loads(path.read_text()))


async def event_stream(csv_path: str, file_id: str, request: AnalyseRequest):
    queue: asyncio.Queue[str | Exception | None] = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def run_agent():
        try:
            initial_state: dict = {
                "csv_path": csv_path,
                "column_types": {},
                "analyses_requested": request.analyses if request.analyses is not None else [],
                "analyses_override": request.analyses is not None,
                "target_column": request.target_column,
                "classification_target": request.classification_target,
                "results": {},
                "stream_log": [],
                "summary": "",
            }
            final_results = {}
            final_summary = ""
            for chunk in agent.stream(initial_state):
                for node_output in chunk.values():
                    for msg in node_output.get("stream_log", []):
                        loop.call_soon_threadsafe(queue.put_nowait, msg)
                    if "results" in node_output:
                        final_results = node_output["results"]
                    if "summary" in node_output:
                        final_summary = node_output["summary"]
            stored = {"results": final_results, "summary": final_summary}
            results_store[file_id] = stored
            _persist(file_id, stored)
            loop.call_soon_threadsafe(queue.put_nowait, None)  # sentinel: success
        except Exception as exc:
            # Forward the exception through the queue so the generator can yield an
            # error event to the client instead of hanging on queue.get() forever.
            loop.call_soon_threadsafe(queue.put_nowait, exc)

    task = asyncio.create_task(asyncio.to_thread(run_agent))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    while True:
        msg = await queue.get()
        if msg is None:
            break
        if isinstance(msg, Exception):
            yield f"data: {json.dumps({'type': 'error', 'data': str(msg)})}\n\n"
            return
        yield f"data: {json.dumps({'type': 'step', 'data': msg})}\n\n"

    yield f"data: {json.dumps({'type': 'done'})}\n\n"


@router.post("/analyse/{file_id}")
async def analyse(file_id: str, request: AnalyseRequest = AnalyseRequest()):
    # If results already exist and the caller isn't forcing a re-run, stream a
    # lightweight replay so the client gets a valid done event without running
    # the agent again.
    if not request.force and (file_id in results_store or (_RESULTS_DIR / f"{file_id}.json").exists()):
        async def _replay():
            yield f"data: {json.dumps({'type': 'step', 'data': 'Results already available.'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        return StreamingResponse(_replay(), media_type="text/event-stream")

    csv_path = resolve_csv_path(file_id)
    if csv_path is None:
        raise HTTPException(status_code=404, detail="File not found")
    return StreamingResponse(event_stream(csv_path, file_id, request), media_type="text/event-stream")


@router.get("/results/{file_id}", response_model=ResultsResponse)
async def get_results(file_id: str):
    stored = results_store.get(file_id)
    if stored is not None:
        return ResultsResponse(results=stored["results"], summary=stored["summary"])
    # Fall back to disk — survives server restart or page refresh after the
    # in-memory cache is cleared.
    from_disk = _load_from_disk(file_id)
    if from_disk is None:
        raise HTTPException(status_code=404, detail="Results not found")
    return from_disk
