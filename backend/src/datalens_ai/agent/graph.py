import json
import pandas as pd
from pydantic import BaseModel

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openrouter import ChatOpenRouter
from langgraph.graph import END, START, StateGraph

from datalens_ai.agent.infer_columns import infer_columns
from datalens_ai.agent.state import AgentState
from datalens_ai.tools.anomaly import run_anomaly
from datalens_ai.tools.clustering import run_clustering
from datalens_ai.tools.regression import run_regression


TOOLS = {
    "run_anomaly":    run_anomaly,
    "run_clustering": run_clustering,
    "run_regression": run_regression,
}

_TOOL_LABELS = {
    "run_clustering": "Grouping data points into clusters",
    "run_regression": "Fitting a regression model",
    "run_anomaly": "Scanning for anomalies",
}


class AnalysisPlan(BaseModel):
    analyses: list[str]


_llm = ChatOpenRouter(model="google/gemini-3.1-flash-lite-preview")


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
            "select which analyses to run from: run_clustering, run_regression, run_anomaly. "
            "Column types: numeric (continuous), categorical (text/strings), datetime, "
            "class_label (low-cardinality integer — treat as categorical for feature counting). "
            "run_regression requires at least 2 numeric columns (class_label columns do not count). "
            "run_clustering requires at least 1 numeric column. "
            "run_anomaly works on any numeric columns."
        )),
        HumanMessage(content=f"Columns: {column_summary}"),
    ])
    # Filter out any tool names the LLM hallucinated that are not in TOOLS.
    valid = [a for a in result.analyses if a in TOOLS]
    return {"analyses_requested": valid, "stream_log": ["Deciding which analyses to run..."]}


def run_tool(state: AgentState) -> dict:
    analyses = list(state["analyses_requested"])
    tool_name = analyses.pop(0)
    label = _TOOL_LABELS.get(tool_name, f"Running {tool_name}")
    df = state["dataframe"] if "dataframe" in state else pd.read_csv(state["csv_path"])
    try:
        kwargs: dict = {}
        if TOOLS[tool_name] is run_regression:
            kwargs["target_column"] = state.get("target_column")
        result = TOOLS[tool_name](df, **kwargs)
        new_results = {**state["results"], tool_name: result}
        log_msg = f"{label}..."
    except ValueError as exc:
        new_results = state["results"]
        log_msg = f"{label} — skipped ({exc})"
    except Exception:
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
    response = _llm.invoke([
        SystemMessage(content=(
            "You are a data analyst. Summarize the following analysis results for a "
            "non-technical audience in 2-3 plain prose sentences. "
            "Do not use markdown, bullet points, bold text, or headers. "
            "Write as if explaining findings to someone who has never seen statistics."
            "Use soft language like 'it appears that' or 'there is some evidence for' rather than making definitive claims, unless the results are extremely clear-cut."
        )),
        HumanMessage(content=results),
    ])
    return {"summary": response.content, "stream_log": ["Writing summary..."]}


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
