from enum import Enum
from pydantic import BaseModel


class ColumnType(str, Enum):
    numeric = "numeric"
    categorical = "categorical"
    datetime = "datetime"
    class_label = "class_label"  # low-cardinality integer — usable as regression target


class TopValue(BaseModel):
    value: str
    count: int


class ColumnProfile(BaseModel):
    missing_count: int
    missing_pct: float  # 0–100, one decimal place
    unique_count: int
    # numeric / class_label
    mean: float | None = None
    std: float | None = None
    min: float | None = None
    max: float | None = None
    # categorical — most frequent values
    top_values: list[TopValue] | None = None
    # datetime — ISO date strings
    min_date: str | None = None
    max_date: str | None = None


class ColumnSchema(BaseModel):
    name: str
    column_type: ColumnType
    profile: ColumnProfile


class UploadResponse(BaseModel):
    file_id: str
    row_count: int
    columns: list[ColumnSchema]
