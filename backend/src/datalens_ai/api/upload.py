import io
import uuid
import tempfile
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, HTTPException, UploadFile

from datalens_ai.agent.infer_columns import infer_columns
from datalens_ai.config import settings
from datalens_ai.models.upload import UploadResponse

router = APIRouter()

# In-memory fast path. Disk is the source of truth so that any uvicorn worker
# can serve a file uploaded by another (see resolve_csv_path).
file_store: dict[str, str] = {}  # file_id → csv path

_UPLOAD_DIR = Path(tempfile.gettempdir()) / "datalens_ai_uploads"
_UPLOAD_DIR.mkdir(exist_ok=True)

_ACCEPTED_CONTENT_TYPES = {"text/csv", "application/csv", "text/plain"}


def resolve_csv_path(file_id: str) -> str | None:
    """Return the stored CSV path for file_id, from memory or disk.

    The disk fallback is what fixes cross-worker 404s: an upload handled by one
    worker leaves the in-memory file_store of the others empty, but the CSV on
    disk is keyed by file_id and visible to all of them.
    """
    cached = file_store.get(file_id)
    if cached is not None and Path(cached).exists():
        return cached
    disk_path = _UPLOAD_DIR / f"{file_id}.csv"
    if disk_path.exists():
        path = str(disk_path)
        file_store[file_id] = path  # warm the cache for subsequent lookups
        return path
    file_store.pop(file_id, None)  # drop stale entry for a file removed underneath us
    return None


@router.post("/upload")
async def upload_file(file: UploadFile) -> UploadResponse:
    filename = file.filename or ""
    if file.content_type not in _ACCEPTED_CONTENT_TYPES and not filename.lower().endswith(".csv"):
        raise HTTPException(status_code=415, detail="Only CSV files are accepted.")

    contents = await file.read()

    if len(contents) > settings.max_upload_bytes:
        limit_mb = settings.max_upload_bytes // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"File exceeds {limit_mb} MB limit.")

    try:
        df = pd.read_csv(io.BytesIO(contents))
    except Exception:
        raise HTTPException(status_code=422, detail="Could not parse file as CSV.")

    if len(df) < 2:
        raise HTTPException(status_code=422, detail="CSV must contain at least 2 data rows.")

    file_id = str(uuid.uuid4())
    dest = _UPLOAD_DIR / f"{file_id}.csv"
    dest.write_bytes(contents)
    file_store[file_id] = str(dest)
    return UploadResponse(file_id=file_id, row_count=len(df), columns=infer_columns(df))
