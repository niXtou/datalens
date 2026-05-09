import io
import uuid
import tempfile

import pandas as pd
from fastapi import APIRouter, UploadFile

from datalens_ai.agent.infer_columns import infer_columns
from datalens_ai.models.upload import UploadResponse

router = APIRouter()
file_store: dict[str, str] = {} # Not for production

@router.post("/upload")
async def upload_file(file: UploadFile) -> UploadResponse:
    contents = await file.read()

    with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    df = pd.read_csv(io.BytesIO(contents))
    columns = infer_columns(df)
    file_id = str(uuid.uuid4())
    file_store[file_id] = tmp_path
    return UploadResponse(file_id=file_id, columns=columns)