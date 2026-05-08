import io
import uuid

import pandas as pd
from fastapi import APIRouter, UploadFile

from datalens_ai.agent.infer_columns import infer_columns
from datalens_ai.models.upload import UploadResponse

router = APIRouter()

@router.post("/upload")
async def upload_file(file: UploadFile) -> UploadResponse:
    contents = await file.read()
    df = pd.read_csv(io.BytesIO(contents))
    columns = infer_columns(df)
    file_id = str(uuid.uuid4())
    return UploadResponse(file_id=file_id, columns=columns)