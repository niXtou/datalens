from typing import TypedDict
from datalens_ai.models.upload import ColumnType

class AgentState(TypedDict):
    csv_path: str
    column_types: dict[str, ColumnType]
    analyses_requested: list[str]
    results: dict # mixed tool outputs
    stream_log: list[str]