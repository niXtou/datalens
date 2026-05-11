import asyncio
import json
import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from datalens_ai.agent.graph import agent
from datalens_ai.api.upload import file_store
from datalens_ai.models.results import ResultsResponse

results_store: dict[str, dict] = {}  # file_id → results; in-memory, not for production

router = APIRouter()


async def event_stream(csv_path: str, file_id: str):
    # Queue carries step strings, an Exception on agent failure, or None as sentinel.
    queue: asyncio.Queue[str | Exception | None] = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def run_agent():
        try:
            initial_state = {
                "csv_path": csv_path,
                "column_types": {},
                "analyses_requested": [],
                "results": {},
                "stream_log": [],
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
            results_store[file_id] = {"results": final_results, "summary": final_summary}
            try:
                os.unlink(csv_path)
            except OSError:
                pass
            loop.call_soon_threadsafe(queue.put_nowait, None)  # sentinel: success
        except Exception as exc:
            # Forward the exception through the queue so the generator can yield an
            # error event to the client instead of hanging on queue.get() forever.
            loop.call_soon_threadsafe(queue.put_nowait, exc)

    # Hold a strong reference so the task is not garbage-collected mid-execution.
    _task = asyncio.create_task(asyncio.to_thread(run_agent))  # noqa: F841

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
async def analyse(file_id: str):
    csv_path = file_store.get(file_id)
    if csv_path is None:
        raise HTTPException(status_code=404, detail="File not found")
    return StreamingResponse(event_stream(csv_path, file_id), media_type="text/event-stream")


@router.get("/results/{file_id}", response_model=ResultsResponse)
async def get_results(file_id: str):
    stored = results_store.get(file_id)
    if stored is None:
        raise HTTPException(status_code=404, detail="Results not found")
    return ResultsResponse(results=stored["results"], summary=stored["summary"])
