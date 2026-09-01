from unittest.mock import patch

import pandas as pd

from datalens_ai.agent.graph import AnalysisPlan, infer_columns_node, plan_analyses, run_tool, summarize
from datalens_ai.models.results import (
    AnomalyResult,
    ClassificationResult,
    ClusteringResult,
    CorrelationResult,
    RegressionResult,
)
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
    assert "x" in anomaly.feature_stats
    assert "mean" in anomaly.feature_stats["x"]


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


def test_summarize_empty_results_returns_graceful_message():
    state = {
        "csv_path": "",
        "column_types": {},
        "analyses_requested": [],
        "results": {},
        "stream_log": [],
    }
    result = summarize(state)

    assert "No analyses" in result["summary"]
    assert result["stream_log"] == ["No results to summarize."]


def test_run_tool_skips_on_tool_error(tmp_path):
    """When a tool raises ValueError, run_tool records the error in the stream log
    but does not propagate the exception — remaining analyses still run."""
    df = pd.DataFrame({"name": ["Alice", "Bob", "Carol"]})
    csv_file = tmp_path / "cat_only.csv"
    df.to_csv(csv_file, index=False)

    state = {
        "csv_path": str(csv_file),
        "column_types": {},
        "analyses_requested": ["run_anomaly"],
        "results": {},
        "stream_log": [],
    }
    result = run_tool(state)

    assert result["analyses_requested"] == []
    assert "run_anomaly" not in result["results"]
    assert "skipped" in result["stream_log"][0].lower()


def test_run_tool_regression_uses_target_column(tmp_path):
    df = pd.DataFrame({
        "a": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0],
        "b": [6.0, 5.0, 4.0, 3.0, 2.0, 1.0],
        "c": [2.0, 4.0, 6.0, 8.0, 10.0, 12.0],
    })
    csv_file = tmp_path / "test.csv"
    df.to_csv(csv_file, index=False)

    state = {
        "csv_path": str(csv_file),
        "column_types": {},
        "analyses_requested": ["run_regression"],
        "results": {},
        "stream_log": [],
        "target_column": "a",  # override: use 'a' instead of last column 'c'
        "summary": "",
    }
    result = run_tool(state)

    regression = result["results"]["run_regression"]
    assert isinstance(regression, RegressionResult)
    assert regression.target_name == "a"


def test_run_tool_regression_allows_class_label_target(tmp_path):
    """A user-specified class_label column must not be excluded from regression."""
    # Build a dataset with 30+ rows so wine_class-style detection triggers.
    n = 30
    df = pd.DataFrame({
        "feature_a": list(range(n)),
        "feature_b": [float(i) * 2 for i in range(n)],
        "class_col": [i % 3 for i in range(n)],  # 3 unique ints, 30 rows → class_label
    })
    csv_file = tmp_path / "test.csv"
    df.to_csv(csv_file, index=False)

    state = {
        "csv_path": str(csv_file),
        "column_types": {},
        "analyses_requested": ["run_regression"],
        "results": {},
        "stream_log": [],
        "target_column": "class_col",
        "summary": "",
    }
    result = run_tool(state)

    regression = result["results"]["run_regression"]
    assert isinstance(regression, RegressionResult)
    assert regression.target_name == "class_col"
    assert "class_col" not in regression.excluded_columns


def test_analyses_override_skips_plan_analyses(tmp_path):
    """When analyses_override=True the graph goes straight to run_tool,
    never calling the LLM plan_analyses node."""
    from datalens_ai.agent.graph import agent

    df = pd.DataFrame({
        "x": [1.0, 2.0, 3.0, 10.0, 11.0, 12.0],
        "y": [1.0, 2.0, 3.0, 10.0, 11.0, 12.0],
    })
    csv_file = tmp_path / "test.csv"
    df.to_csv(csv_file, index=False)

    with patch("datalens_ai.agent.graph._llm") as mock_llm:
        mock_llm.invoke.return_value.content = "Summary."
        # plan_analyses must NOT be called
        final = agent.invoke({
            "csv_path": str(csv_file),
            "column_types": {},
            "analyses_requested": ["run_clustering"],
            "analyses_override": True,
            "results": {},
            "stream_log": [],
            "summary": "",
        })

    # structured_output (plan_analyses) was never called
    mock_llm.with_structured_output.assert_not_called()
    assert "run_clustering" in final["results"]


def test_plan_analyses_drops_classification_without_class_label():
    state = {
        "csv_path": "",
        "column_types": {"age": ColumnType.numeric, "salary": ColumnType.numeric},
        "analyses_requested": [],
        "results": {},
        "stream_log": [],
    }

    with patch("datalens_ai.agent.graph._llm") as mock_llm:
        mock_llm.with_structured_output.return_value.invoke.return_value = AnalysisPlan(
            analyses=["run_classification", "run_correlation", "run_clustering"]
        )
        result = plan_analyses(state)

    # No class_label column → classification dropped; 2 numeric → correlation kept.
    assert result["analyses_requested"] == ["run_correlation", "run_clustering"]


def test_plan_analyses_keeps_classification_with_class_label():
    state = {
        "csv_path": "",
        "column_types": {"age": ColumnType.numeric, "kind": ColumnType.class_label},
        "analyses_requested": [],
        "results": {},
        "stream_log": [],
    }

    with patch("datalens_ai.agent.graph._llm") as mock_llm:
        mock_llm.with_structured_output.return_value.invoke.return_value = AnalysisPlan(
            analyses=["run_classification", "run_correlation"]
        )
        result = plan_analyses(state)

    assert result["analyses_requested"] == ["run_classification", "run_correlation"]


def test_plan_analyses_drops_correlation_with_one_numeric_column():
    state = {
        "csv_path": "",
        "column_types": {"age": ColumnType.numeric, "name": ColumnType.categorical},
        "analyses_requested": [],
        "results": {},
        "stream_log": [],
    }

    with patch("datalens_ai.agent.graph._llm") as mock_llm:
        mock_llm.with_structured_output.return_value.invoke.return_value = AnalysisPlan(
            analyses=["run_correlation", "run_anomaly"]
        )
        result = plan_analyses(state)

    assert result["analyses_requested"] == ["run_anomaly"]


def test_run_tool_classification_uses_classification_target(tmp_path):
    n = 40
    df = pd.DataFrame({
        "x": [float(i) for i in range(n)],
        "y": [float(i % 7) for i in range(n)],
        "group": ["low" if i < n // 2 else "high" for i in range(n)],
    })
    csv_file = tmp_path / "test.csv"
    df.to_csv(csv_file, index=False)

    state = {
        "csv_path": str(csv_file),
        "column_types": {},
        "analyses_requested": ["run_classification"],
        "results": {},
        "stream_log": [],
        "classification_target": "group",
        "summary": "",
    }
    result = run_tool(state)

    classification = result["results"]["run_classification"]
    assert isinstance(classification, ClassificationResult)
    assert classification.target_name == "group"
    assert classification.class_labels == ["high", "low"]
    assert classification.feature_names == ["x", "y"]
    assert result["stream_log"] == ["Training a classifier..."]


def test_run_tool_classification_skips_without_target(tmp_path):
    df = pd.DataFrame({"x": [1.0, 2.0, 3.0, 4.0], "y": [2.0, 4.0, 6.0, 8.0]})
    csv_file = tmp_path / "test.csv"
    df.to_csv(csv_file, index=False)

    state = {
        "csv_path": str(csv_file),
        "column_types": {},
        "analyses_requested": ["run_classification"],
        "results": {},
        "stream_log": [],
    }
    result = run_tool(state)

    assert "run_classification" not in result["results"]
    assert "skipped" in result["stream_log"][0]


def test_run_tool_correlation(tmp_path):
    df = pd.DataFrame({
        "a": [1.0, 2.0, 3.0, 4.0, 5.0],
        "b": [5.0, 4.0, 3.0, 2.0, 1.0],
        "name": ["p", "q", "r", "s", "t"],
    })
    csv_file = tmp_path / "test.csv"
    df.to_csv(csv_file, index=False)

    state = {
        "csv_path": str(csv_file),
        "column_types": {},
        "analyses_requested": ["run_correlation"],
        "results": {},
        "stream_log": [],
    }
    result = run_tool(state)

    correlation = result["results"]["run_correlation"]
    assert isinstance(correlation, CorrelationResult)
    assert correlation.columns == ["a", "b"]
    assert correlation.top_pairs[0].r == -1.0
    assert result["stream_log"] == ["Measuring correlations..."]


def _clustering_state() -> dict:
    return {
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


def test_summarize_falls_back_when_llm_fails():
    with patch("datalens_ai.agent.graph._llm") as mock_llm:
        mock_llm.invoke.side_effect = RuntimeError("connection refused")
        result = summarize(_clustering_state())

    assert result["summary"] == ""
    assert result["stream_log"] == ["Summary unavailable — the language model could not be reached."]


def test_summarize_joins_list_content():
    with patch("datalens_ai.agent.graph._llm") as mock_llm:
        mock_llm.invoke.return_value.content = [
            {"type": "text", "text": "Two groups. "},
            "Plain part.",
            {"type": "image", "url": "ignored"},
        ]
        result = summarize(_clustering_state())

    assert result["summary"] == "Two groups. Plain part."


def test_summarize_excludes_array_fields_from_prompt():
    """The prompt sent to the LLM must carry only scalar fields."""
    state = _clustering_state()
    state["results"]["run_correlation"] = CorrelationResult(
        columns=["a", "b"], matrix=[[1.0, 0.5], [0.5, 1.0]], top_pairs=[], truncated=False,
    )
    with patch("datalens_ai.agent.graph._llm") as mock_llm:
        mock_llm.invoke.return_value.content = "ok"
        summarize(state)
        prompt = mock_llm.invoke.call_args.args[0][1].content

    assert "matrix" not in prompt
    assert "cluster_labels" not in prompt
    assert "truncated" in prompt
