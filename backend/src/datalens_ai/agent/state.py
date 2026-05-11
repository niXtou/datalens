import operator
from typing import Annotated, Any, NotRequired, TypedDict

from datalens_ai.models.results import AnalysisResult
from datalens_ai.models.upload import ColumnType


class AgentState(TypedDict):
    csv_path: str
    column_types: dict[str, ColumnType]
    analyses_requested: list[str]
    results: dict[str, AnalysisResult]
    stream_log: Annotated[list[str], operator.add]
    summary: NotRequired[str]
    # pd.DataFrame loaded once in infer_columns_node and reused by run_tool
    # to avoid re-parsing the CSV on every tool call.
    dataframe: NotRequired[Any]
    # Set to True when the caller provides an explicit analyses list so the
    # graph can skip the LLM planning node.
    analyses_override: NotRequired[bool]
    # User-chosen regression target column; None = use last-column heuristic.
    target_column: NotRequired[str | None]