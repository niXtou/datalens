from enum import Enum
from pydantic import BaseModel


class ColumnType(str, Enum):
    numeric = "numeric"
    categorical = "categorical"
    datetime = "datetime"


class ColumnSchema(BaseModel):
    name: str
    column_type: ColumnType


class UploadResponse(BaseModel):
    file_id: str
    columns: list[ColumnSchema]