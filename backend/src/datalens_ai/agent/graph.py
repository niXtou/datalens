import json
import logging

import pandas as pd
from pydantic import BaseModel

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openrouter import ChatOpenRouter
from langgraph.graph import END, START, StateGraph

from datalens_ai.agent.infer_columns import infer_columns
from datalens_ai.agent.state import AgentState
from datalens_ai.config import settings
from datalens_ai.models.upload import ColumnType
from datalens_ai.tools.anomaly import run_anomaly
from datalens_ai.tools.classification import run_classification
from datalens_ai.tools.clustering import run_clustering
from datalens_ai.tools.correlation import run_correlation
from datalens_ai.tools.regression import run_regression

logger = logging.getLogger(__name__)

TOOLS = {
    "run_anomaly":        run_anomaly,
    "run_clustering":     run_clustering,
    "run_regression":     run_regression,
    "run_classification": run_classification,
    "run_correlation":    run_correlation,
}

_TOOL_LABELS = {
    "run_clustering":     "Grouping data points into clusters",
    "run_regression":     "Fitting a regression model",
    "run_anomaly":        "Scanning for anomalies",
    "run_classification": "Training a classifier",
    "run_correlation":    "Measuring correlations",
}

_MIN_CORRELATION_COLUMNS = 2
_SUMMARY_UNAVAILABLE = "Summary unavailable — the language model could not be reached."


class AnalysisPlan(BaseModel):
    analyses: list[str]


_llm = ChatOpenRouter(model=settings.llm_model)


def infer_columns_node(state: AgentState) -> dict:
    df = pd.read_csv(state["csv_path"])
    schemas = infer_columns(df)
    return {
        "dataframe": df,
        "column_types": {s.name: s.column_type for s in schemas},
        "stream_log": ["Inspecting data structure..."],
    }


def plan_analyses(state: AgentState) -> dict:
    structured_llm = _llm.with_structured_output(AnalysisPlan)
    column_summary = ", ".join(
        f"{name}: {ctype.value}" for name, ctype in state["column_types"].items()
    )
    result = structured_llm.invoke([
        SystemMessage(content=(
            "You are a data analyst. Given column types from a CSV, "
            "select which analyses to run from: run_clustering, run_regression, run_anomaly, "
            "run_classification, run_correlation. "
            "Column types: numeric (continuous), categorical (text/strings), datetime, "
            "class_label (low-cardinality integer — treat as categorical for feature counting). "
            "run_regression requires at least 2 numeric columns (class_label columns do not count). "
            "run_clustering requires at least 1 numeric column. "
            "run_anomaly works on any numeric columns. "
            "run_classification requires a class_label column (or a low-cardinality categorical "
            "column) to predict, plus at least 1 numeric column. "
            "run_correlation requires at least 2 numeric columns."
        )),
        HumanMessage(content=f"Columns: {column_summary}"),
    ])
    # Filter out any tool names the LLM hallucinated that are not in TOOLS, then
    # enforce the hard prerequisites in code — the LLM is a suggestion, not a guarantee.
    valid = [a for a in result.analyses if a in TOOLS]
    valid = _filter_by_prerequisites(valid, state["column_types"])
    return {"analyses_requested": valid, "stream_log": ["Deciding which analyses to run..."]}


def _filter_by_prerequisites(analyses: list[str], column_types: dict[str, ColumnType]) -> list[str]:
    """Drop planned tools whose column-type requirements the dataset cannot meet."""
    types = list(column_types.values())
    has_class_label = ColumnType.class_label in types
    n_numeric = sum(t in (ColumnType.numeric, ColumnType.class_label) for t in types)
    kept = []
    for name in analyses:
        if name == "run_classification" and not has_class_label:
            continue
        if name == "run_correlation" and n_numeric < _MIN_CORRELATION_COLUMNS:
            continue
        kept.append(name)
    return kept


def run_tool(state: AgentState) -> dict:
    analyses = list(state["analyses_requested"])
    tool_name = analyses.pop(0)
    label = _TOOL_LABELS.get(tool_name, f"Running {tool_name}")
    df = state["dataframe"] if "dataframe" in state else pd.read_csv(state["csv_path"])
    try:
        kwargs: dict = {}
        if TOOLS[tool_name] is run_regression:
            kwargs["target_column"] = state.get("target_column")
        elif TOOLS[tool_name] is run_classification:
            kwargs["target_column"] = state.get("classification_target")
        result = TOOLS[tool_name](df, **kwargs)
        new_results = {**state["results"], tool_name: result}
        log_msg = f"{label}..."
    except ValueError as exc:
        new_results = state["results"]
        log_msg = f"{label} — skipped ({exc})"
    except Exception:
        logger.exception("Tool %s failed unexpectedly", tool_name)
        new_results = state["results"]
        log_msg = f"{label} — skipped (unexpected error)"
    return {
        "analyses_requested": analyses,
        "results": new_results,
        "stream_log": [log_msg],
    }


# Fields that carry raw data points — excluded from the LLM prompt to avoid
# wasting tokens on numbers the model can't meaningfully interpret.
_ARRAY_FIELDS = {
    "cluster_labels", "x_values", "y_values",
    "actuals", "predicted",
    "standardized_coefficients", "anomaly_rows", "feature_stats",
    "matrix", "top_pairs", "columns",
    "confusion_matrix", "feature_importances", "feature_names", "class_labels",
}


def _scalar_summary(results: dict) -> str:
    """Return a JSON string with only scalar fields from each result."""
    return json.dumps(
        {k: result.model_dump(exclude=_ARRAY_FIELDS) for k, result in results.items()},
        indent=2,
    )


def summarize(state: AgentState) -> dict:
    if not state["results"]:
        return {
            "summary": "No analyses could be run on this dataset.",
            "stream_log": ["No results to summarize."],
        }
    results = _scalar_summary(state["results"])
    try:
        response = _llm.invoke([
            SystemMessage(content=(
                "You are a data analyst. Summarize the following analysis results for a "
                "non-technical audience in 2-3 plain prose sentences. "
                "Do not use markdown, bullet points, bold text, or headers. "
                "Write as if explaining findings to someone who has never seen statistics."
                "Use soft language like 'it appears that' or 'there is some evidence for' rather "
                "than making definitive claims, unless the results are extremely clear-cut."
            )),
            HumanMessage(content=results),
        ])
    except Exception:
        # The tool results are already computed — a dead LLM must not throw them away.
        logger.warning("Summary LLM call failed; returning results without a summary", exc_info=True)
        return {"summary": "", "stream_log": [_SUMMARY_UNAVAILABLE]}
    return {"summary": _message_text(response.content), "stream_log": ["Writing summary..."]}


def _message_text(content: str | list) -> str:
    """Flatten LangChain message content — a string, or a list of text parts — to plain text."""
    if isinstance(content, str):
        return content
    parts = []
    for part in content:
        if isinstance(part, str):
            parts.append(part)
        elif isinstance(part, dict) and isinstance(part.get("text"), str):
            parts.append(part["text"])
    return "".join(parts)


def should_continue(state: AgentState) -> str:
    if state["analyses_requested"]:
        return "run_tool"
    return "summarize"


def _after_infer(state: AgentState) -> str:
    """Skip LLM planning when the caller has already specified which analyses to run."""
    if state.get("analyses_override"):
        return "run_tool" if state["analyses_requested"] else "summarize"
    return "plan_analyses"


builder = StateGraph(AgentState)
builder.add_node("infer_columns", infer_columns_node)
builder.add_node("plan_analyses", plan_analyses)
builder.add_node("run_tool", run_tool)
builder.add_node("summarize", summarize)
builder.add_edge(START, "infer_columns")
builder.add_conditional_edges("infer_columns", _after_infer, ["plan_analyses", "run_tool", "summarize"])
builder.add_conditional_edges("plan_analyses", should_continue, ["run_tool", "summarize"])
builder.add_conditional_edges("run_tool", should_continue, ["run_tool", "summarize"])
builder.add_edge("summarize", END)

agent = builder.compile()
