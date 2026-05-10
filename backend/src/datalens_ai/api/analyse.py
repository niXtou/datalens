import asyncio
import json
from datalens_ai.models.results import ResultsResponse
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from datalens_ai.agent.graph import agent
from datalens_ai.api.upload import file_store

results_store: dict[str, dict] = {}

router = APIRouter()

async def event_stream(csv_path: str, file_id: str):
    # asyncio.Queue is the bridge between the agent thread and this async generator.
    # The agent puts messages in; this generator reads them out.
    queue: asyncio.Queue[str | None] = asyncio.Queue()
    loop = asyncio.get_running_loop()  # get_running_loop() is preferred over get_event_loop() in async contexts

    def run_agent():
        initial_state = {
            "csv_path": csv_path,
            "column_types": {},
            "analyses_requested": [],
            "results": {},
            "stream_log": [],
        }
        final_results = {}
        final_summary = ""
        # agent.stream() yields one chunk per node: {"node_name": {partial state}}
        # We extract stream_log messages from each chunk and push them to the queue.
        for chunk in agent.stream(initial_state):
            for node_output in chunk.values():
                for msg in node_output.get("stream_log", []):
                    # call_soon_threadsafe is required here because queue.put_nowait
                    # is not thread-safe — this schedules it safely onto the event loop.
                    loop.call_soon_threadsafe(queue.put_nowait, msg)
                if "results" in node_output:
                    final_results = node_output["results"]
                if "summary" in node_output:
                    final_summary = node_output["summary"]
        results_store[file_id] = {"results": final_results, "summary": final_summary}  # store final results for retrieval after streaming
        loop.call_soon_threadsafe(queue.put_nowait, None)  # None = sentinel: signals the generator to stop

    # asyncio.to_thread() runs run_agent in a thread pool (non-blocking).
    # ensure_future() schedules it without awaiting — agent runs concurrently while we read from the queue.
    asyncio.ensure_future(asyncio.to_thread(run_agent))

    while True:
        msg = await queue.get()
        if msg is None:  # sentinel received — agent is done
            break
        # SSE wire format: "data: <json>\n\n" — the double newline terminates each event.
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