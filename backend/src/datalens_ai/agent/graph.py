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
    "run_anomaly": run_anomaly,
    "run_clustering": run_clustering,
    "run_regression": run_regression,
}


class AnalysisPlan(BaseModel):
    analyses: list[str]


_llm = ChatOpenRouter(model="google/gemini-3.1-flash-lite-preview")


def infer_columns_node(state: AgentState) -> dict:
    df = pd.read_csv(state["csv_path"])
    schemas = infer_columns(df)
    return {
        "column_types": {s.name: s.column_type for s in schemas},
        "stream_log": ["Inferring column types..."],
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
            "run_regression requires at least 2 numeric columns. "
            "run_clustering requires at least 1 numeric column. "
            "run_anomaly works on any numeric columns."
        )),
        HumanMessage(content=f"Columns: {column_summary}"),
    ])
    # Filter out any tool names the LLM hallucinated that are not in TOOLS.
    valid = [a for a in result.analyses if a in TOOLS]
    return {"analyses_requested": valid, "stream_log": ["Planning analyses..."]}


def run_tool(state: AgentState) -> dict:
    analyses = list(state["analyses_requested"])
    tool_name = analyses.pop(0)
    df = pd.read_csv(state["csv_path"])
    result = TOOLS[tool_name](df)
    return {
        "analyses_requested": analyses,
        "results": {**state["results"], tool_name: result},
        "stream_log": [f"Running {tool_name}..."],
    }


def summarize(state: AgentState) -> dict:
    results = json.dumps(
        {k: v.model_dump() for k, v in state["results"].items()},
        indent=2,
    )
    response = _llm.invoke([
        SystemMessage(content=(
            "You are a data analyst. Summarize the following analysis results "
            "for a non-technical audience. Be concise."
        )),
        HumanMessage(content=results),
    ])
    return {"summary": response.content, "stream_log": ["Summarizing results...", response.content]}


def should_continue(state: AgentState) -> str:
    if state["analyses_requested"]:
        return "run_tool"
    return "summarize"


builder = StateGraph(AgentState)
builder.add_node("infer_columns", infer_columns_node)
builder.add_node("plan_analyses", plan_analyses)
builder.add_node("run_tool", run_tool)
builder.add_node("summarize", summarize)
builder.add_edge(START, "infer_columns")
builder.add_edge("infer_columns", "plan_analyses")
builder.add_conditional_edges("plan_analyses", should_continue, ["run_tool", "summarize"])
builder.add_conditional_edges("run_tool", should_continue, ["run_tool", "summarize"])
builder.add_edge("summarize", END)

agent = builder.compile()
