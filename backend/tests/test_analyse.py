import json
import uuid
import pandas as pd
import pytest
from unittest.mock import patch, MagicMock
from datalens_ai.agent.graph import AnalysisPlan
from datalens_ai.api.upload import file_store
from datalens_ai.api.analyse import results_store
from datalens_ai.models.results import ClusteringResult


def test_analyse_unknown_file(client):
    response = client.post("/analyse/nonexistent-id")
    assert response.status_code == 404


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
                silhouette_score=0.75
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
