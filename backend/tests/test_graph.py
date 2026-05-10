from unittest.mock import MagicMock, patch

import pandas as pd

from datalens_ai.agent.graph import infer_columns_node, plan_analyses, AnalysisPlan, run_tool, summarize
from datalens_ai.models.upload import ColumnType
from datalens_ai.models.results import ClusteringResult

def test_infer_columns_node(tmp_path):
    # Create a small CSV with known column types
    df = pd.DataFrame({
        "age": [25, 30, 35],
        "name": ["alice", "bob", "carol"],
    })
    csv_file = tmp_path / "test.csv"
    df.to_csv(csv_file, index=False)

    state = {
        "csv_path": str(csv_file),
        "column_types": {},
        "analyses_requested": [],
        "results": {},
        "stream_log": [],
    }

    result = infer_columns_node(state)

    assert result["column_types"]["age"] == ColumnType.numeric
    assert result["column_types"]["name"] == ColumnType.categorical


def test_plan_analyses(tmp_path):
    state = {
        "csv_path": "",
        "column_types": {
            "age": ColumnType.numeric,
            "salary": ColumnType.numeric,
            "name": ColumnType.categorical,
        },
        "analyses_requested": [],
        "results": {},
        "stream_log": [],
    }

    with patch("datalens_ai.agent.graph._llm") as mock_llm:
        mock_llm.with_structured_output.return_value.invoke.return_value = AnalysisPlan(analyses=["run_clustering", "run_regression"])

        result = plan_analyses(state)

    assert result["analyses_requested"] == ["run_clustering", "run_regression"]


def test_run_tool_clustering(tmp_path):
    df = pd.DataFrame({
        "x": [1.0, 2.0, 3.0, 10.0, 11.0, 12.0],
        "y": [1.0, 2.0, 3.0, 10.0, 11.0, 12.0],
    })

    csv_file = tmp_path / "test.csv"
    df.to_csv(csv_file, index=False)

    state = {
        "csv_path": str(csv_file),
        "column_types": {},
        "analyses_requested": ["run_clustering"],
        "results": {},
        "stream_log": [],
    }

    result = run_tool(state)

    assert result["analyses_requested"] == []
    assert "run_clustering" in result["results"]
    clustering = result["results"]["run_clustering"]
    assert isinstance(clustering, ClusteringResult)
    assert len(clustering.cluster_labels) == 6
    assert isinstance(clustering.silhouette_score, float)


def test_summarize():
    state = {
        "csv_path": "",
        "column_types": {},
        "analyses_requested": [],
        "results": {"run_clustering": ClusteringResult(cluster_labels=[0, 1, 0], silhouette_score=0.7)},
        "stream_log": [],
    }

    with patch("datalens_ai.agent.graph._llm") as mock_llm:
        mock_llm.invoke.return_value.content = "The clustering analysis found 2 clusters with a silhouette score of 0.7."

        result = summarize(state)

    assert result["stream_log"] == [
        "Summarizing results...",
        "The clustering analysis found 2 clusters with a silhouette score of 0.7.",
    ]