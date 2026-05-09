from typing import TypedDict, Annotated
from datalens_ai.models.upload import ColumnType
import operator

class AgentState(TypedDict):
    csv_path: str
    column_types: dict[str, ColumnType]
    analyses_requested: list[str]
    results: dict # mixed tool outputs
    stream_log: Annotated[list[str], operator.add]