from unittest.mock import patch

import pandas as pd

from datalens_ai.agent.graph import AnalysisPlan, infer_columns_node, plan_analyses, run_tool, summarize
from datalens_ai.models.results import AnomalyResult, ClusteringResult, RegressionResult
from datalens_ai.models.upload import ColumnType


def test_infer_columns_node(tmp_path):
    df = pd.DataFrame({"age": [25, 30, 35], "name": ["alice", "bob", "carol"]})
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


def test_plan_analyses():
    state = {
        "csv_path": "",
        "column_types": {"age": ColumnType.numeric, "salary": ColumnType.numeric, "name": ColumnType.categorical},
        "analyses_requested": [],
        "results": {},
        "stream_log": [],
    }

    with patch("datalens_ai.agent.graph._llm") as mock_llm:
        mock_llm.with_structured_output.return_value.invoke.return_value = AnalysisPlan(
            analyses=["run_clustering", "run_regression"]
        )
        result = plan_analyses(state)

    assert result["analyses_requested"] == ["run_clustering", "run_regression"]


def test_plan_analyses_filters_hallucinated_tools():
    state = {
        "csv_path": "",
        "column_types": {"x": ColumnType.numeric},
        "analyses_requested": [],
        "results": {},
        "stream_log": [],
    }

    with patch("datalens_ai.agent.graph._llm") as mock_llm:
        mock_llm.with_structured_output.return_value.invoke.return_value = AnalysisPlan(
            analyses=["run_clustering", "run_nonexistent_tool"]
        )
        result = plan_analyses(state)

    assert result["analyses_requested"] == ["run_clustering"]


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

    clustering = result["results"]["run_clustering"]
    assert isinstance(clustering, ClusteringResult)
    assert result["analyses_requested"] == []
    assert len(clustering.cluster_labels) == 6
    assert isinstance(clustering.silhouette_score, float)
    assert 2 <= clustering.n_clusters <= 6
    assert clustering.feature_x == "x"
    assert clustering.feature_y == "y"
    assert not clustering.pca_projection  # only 2 columns — no PCA
    assert len(clustering.x_values) == 6
    assert len(clustering.y_values) == 6


def test_run_tool_regression(tmp_path):
    df = pd.DataFrame({
        "x": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0],
        "y": [2.0, 4.0, 6.0, 8.0, 10.0, 12.0],
    })
    csv_file = tmp_path / "test.csv"
    df.to_csv(csv_file, index=False)

    state = {
        "csv_path": str(csv_file),
        "column_types": {},
        "analyses_requested": ["run_regression"],
        "results": {},
        "stream_log": [],
        "summary": "",
    }
    result = run_tool(state)

    regression = result["results"]["run_regression"]
    assert isinstance(regression, RegressionResult)
    assert isinstance(regression.r2_score, float)
    assert regression.feature_names == ["x"]
    assert regression.target_name == "y"
    assert len(regression.actuals) == 6
    assert len(regression.predicted) == 6
    assert len(regression.standardized_coefficients) == 1


def test_run_tool_anomaly(tmp_path):
    df = pd.DataFrame({
        "x": [1.0, 2.0, 3.0, 1.1, 2.1, 100.0],
        "y": [1.0, 2.0, 3.0, 1.1, 2.1, 100.0],
    })
    csv_file = tmp_path / "test.csv"
    df.to_csv(csv_file, index=False)

    state = {
        "csv_path": str(csv_file),
        "column_types": {},
        "analyses_requested": ["run_anomaly"],
        "results": {},
        "stream_log": [],
        "summary": "",
    }
    result = run_tool(state)

    anomaly = result["results"]["run_anomaly"]
    assert isinstance(anomaly, AnomalyResult)
    assert isinstance(anomaly.contamination_rate, float)
    assert isinstance(anomaly.anomaly_rows, list)
    assert len(anomaly.anomaly_rows) == len(anomaly.anomaly_indices)


def test_summarize():
    state = {
        "csv_path": "",
        "column_types": {},
        "analyses_requested": [],
        "results": {
            "run_clustering": ClusteringResult(
                cluster_labels=[0, 1, 0],
                silhouette_score=0.7,
                n_clusters=2,
                feature_x="x",
                feature_y="y",
                x_values=[1.0, 2.0, 3.0],
                y_values=[1.0, 2.0, 3.0],
            )
        },
        "stream_log": [],
    }

    with patch("datalens_ai.agent.graph._llm") as mock_llm:
        mock_llm.invoke.return_value.content = "The data has two clear groups."
        result = summarize(state)

    assert result["stream_log"] == ["Writing summary..."]
    assert result["summary"] == "The data has two clear groups."
