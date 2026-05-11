import io
import uuid
import tempfile

import pandas as pd
from fastapi import APIRouter, HTTPException, UploadFile

from datalens_ai.agent.infer_columns import infer_columns
from datalens_ai.config import settings
from datalens_ai.models.upload import UploadResponse

router = APIRouter()
file_store: dict[str, str] = {}  # file_id → tmp path; in-memory, not for production

_ACCEPTED_CONTENT_TYPES = {"text/csv", "application/csv", "text/plain"}


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

    with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    file_id = str(uuid.uuid4())
    file_store[file_id] = tmp_path
    return UploadResponse(file_id=file_id, columns=infer_columns(df))
