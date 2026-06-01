import json
import uuid
import pandas as pd
from unittest.mock import patch
from datalens_ai.agent.graph import AnalysisPlan
from datalens_ai.api.upload import file_store
from datalens_ai.api.analyse import results_store
from datalens_ai.models.results import ClusteringResult


def test_analyse_unknown_file(client):
    response = client.post("/analyse/nonexistent-id")
    assert response.status_code == 404


def test_analyse_after_filestore_miss_resolves_from_disk(client):
    """Regression: with multiple uvicorn workers the worker serving /analyse has
    an empty in-memory file_store, but the upload is on disk keyed by file_id, so
    the request must resolve from disk instead of returning a 404."""
    df = pd.DataFrame({
        "x": [1.0, 2.0, 3.0, 10.0, 11.0, 12.0],
        "y": [1.0, 2.0, 3.0, 10.0, 11.0, 12.0],
    })
    csv_bytes = df.to_csv(index=False).encode()
    upload = client.post("/upload", files={"file": ("d.csv", csv_bytes, "text/csv")})
    file_id = upload.json()["file_id"]

    # Simulate the analyse request landing on a worker that never saw the upload.
    file_store.clear()

    with patch("datalens_ai.agent.graph._llm") as mock_llm:
        mock_llm.with_structured_output.return_value.invoke.return_value = AnalysisPlan(
            analyses=["run_clustering"]
        )
        mock_llm.invoke.return_value.content = "Summary."
        with client.stream(
            "POST",
            f"/analyse/{file_id}",
            json={"analyses": ["run_clustering"]},
        ) as response:
            assert response.status_code == 200  # not 404
            list(response.iter_lines())


def test_sse_event_sequence(client, tmp_path):
    df = pd.DataFrame({
        "x": [1.0, 2.0, 3.0, 10.0, 11.0, 12.0],
        "y": [1.0, 2.0, 3.0, 10.0, 11.0, 12.0]
    })
    csv_file = tmp_path / "test.csv"
    df.to_csv(csv_file, index=False)

    file_id = str(uuid.uuid4())
    file_store[file_id] = str(csv_file)

    with patch("datalens_ai.agent.graph._llm") as mock_llm:
        mock_llm.with_structured_output.return_value.invoke.return_value = AnalysisPlan(
            analyses = ["run_clustering"]
        )
        mock_llm.invoke.return_value.content = "Summary text."

        with client.stream("POST", f"/analyse/{file_id}") as response:
            assert response.status_code == 200
            lines = [
                line for line in response.iter_lines()
                if line.startswith("data: ")
            ]

    events = [json.loads(line[6:]) for line in lines]
    types = [e["type"] for e in events]
    assert "step" in types
    assert events[-1]["type"] == "done"


def test_get_results_unknown_file(client):
    response = client.get("/results/nonexistent-id")
    assert response.status_code == 404


def test_get_results_returns_stored_data(client):
    file_id = str(uuid.uuid4())
    results_store[file_id] = {
        "results": {
            "run_clustering": ClusteringResult(
                cluster_labels=[0, 1, 2],
                silhouette_score=0.75,
                n_clusters=3,
                feature_x="x",
                feature_y="y",
                x_values=[1.0, 2.0, 3.0],
                y_values=[1.0, 2.0, 3.0],
            )
        },
        "summary": "Test summary."
    }

    response = client.get(f"/results/{file_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["summary"] == "Test summary."
    assert "run_clustering" in data["results"]
    assert data["results"]["run_clustering"]["type"] == "clustering"
    assert data["results"]["run_clustering"]["silhouette_score"] == 0.75


def test_upload_csv(client, tmp_path):
    df = pd.DataFrame({
        "age": [25, 30],
        "name": ["Alice", "Bob"]
    })
    csv_bytes = df.to_csv(index=False).encode()

    response = client.post(
        "/upload",
        files={"file": ("test.csv", csv_bytes, "text/csv")}
    )

    assert response.status_code == 200
    data = response.json()
    assert "file_id" in data
    assert len(data["columns"]) == 2


def test_upload_rejects_single_row_csv(client):
    csv_bytes = b"a,b\n1,2\n"
    response = client.post("/upload", files={"file": ("one_row.csv", csv_bytes, "text/csv")})
    assert response.status_code == 422
    assert "2 data rows" in response.json()["detail"]


def test_upload_rejects_headers_only_csv(client):
    csv_bytes = b"a,b,c\n"
    response = client.post("/upload", files={"file": ("no_data.csv", csv_bytes, "text/csv")})
    assert response.status_code == 422


def test_force_rerun_overwrites_existing_results(client, tmp_path):
    """POST /analyse with force=true re-runs the agent even when results exist."""
    df = pd.DataFrame({
        "x": [1.0, 2.0, 3.0, 10.0, 11.0, 12.0],
        "y": [1.0, 2.0, 3.0, 10.0, 11.0, 12.0],
    })
    csv_file = tmp_path / "test.csv"
    df.to_csv(csv_file, index=False)

    file_id = str(uuid.uuid4())
    file_store[file_id] = str(csv_file)
    # Pre-populate stale results
    results_store[file_id] = {"results": {}, "summary": "stale"}

    with patch("datalens_ai.agent.graph._llm") as mock_llm:
        mock_llm.with_structured_output.return_value.invoke.return_value = AnalysisPlan(
            analyses=["run_clustering"]
        )
        mock_llm.invoke.return_value.content = "Fresh summary."
        with client.stream(
            "POST",
            f"/analyse/{file_id}",
            json={"force": True, "analyses": ["run_clustering"]},
        ) as response:
            assert response.status_code == 200
            list(response.iter_lines())

    assert results_store[file_id]["summary"] == "Fresh summary."


def test_already_analysed_returns_replay(client, tmp_path):
    """A second POST to /analyse returns a replay stream, not a re-run."""
    file_id = str(uuid.uuid4())
    results_store[file_id] = {
        "results": {
            "run_clustering": ClusteringResult(
                cluster_labels=[0, 1],
                silhouette_score=0.5,
                n_clusters=2,
                feature_x="x",
                feature_y="y",
                x_values=[1.0, 2.0],
                y_values=[1.0, 2.0],
            )
        },
        "summary": "Cached summary.",
    }

    with client.stream("POST", f"/analyse/{file_id}") as response:
        assert response.status_code == 200
        lines = [line for line in response.iter_lines() if line.startswith("data: ")]

    events = [json.loads(line[6:]) for line in lines]
    assert any(e["type"] == "step" and "already available" in e["data"] for e in events)
    assert events[-1]["type"] == "done"


def test_analyse_with_explicit_analyses_list(client, tmp_path):
    df = pd.DataFrame({
        "x": [1.0, 2.0, 3.0, 10.0, 11.0, 12.0],
        "y": [1.0, 2.0, 3.0, 10.0, 11.0, 12.0],
    })
    csv_file = tmp_path / "test.csv"
    df.to_csv(csv_file, index=False)

    file_id = str(uuid.uuid4())
    file_store[file_id] = str(csv_file)

    with patch("datalens_ai.agent.graph._llm") as mock_llm:
        mock_llm.invoke.return_value.content = "Summary."
        with client.stream(
            "POST",
            f"/analyse/{file_id}",
            json={"analyses": ["run_clustering"]},
        ) as response:
            assert response.status_code == 200
            lines = [line for line in response.iter_lines() if line.startswith("data: ")]

    # plan_analyses (structured output) should never have been called
    mock_llm.with_structured_output.assert_not_called()
    events = [json.loads(line[6:]) for line in lines]
    assert events[-1]["type"] == "done"


def test_analyse_with_target_column(client, tmp_path):
    df = pd.DataFrame({
        "a": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0],
        "b": [6.0, 5.0, 4.0, 3.0, 2.0, 1.0],
        "c": [2.0, 4.0, 6.0, 8.0, 10.0, 12.0],
    })
    csv_file = tmp_path / "test.csv"
    df.to_csv(csv_file, index=False)

    file_id = str(uuid.uuid4())
    file_store[file_id] = str(csv_file)

    with patch("datalens_ai.agent.graph._llm") as mock_llm:
        mock_llm.invoke.return_value.content = "Summary."
        with client.stream(
            "POST",
            f"/analyse/{file_id}",
            json={"analyses": ["run_regression"], "target_column": "a"},
        ) as response:
            assert response.status_code == 200
            list(response.iter_lines())  # consume stream

    results = results_store.get(file_id)
    assert results is not None
    reg = results["results"].get("run_regression")
    assert reg is not None
    assert reg.target_name == "a"

