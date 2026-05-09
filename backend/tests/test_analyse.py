import json
import uuid
import pandas as pd
import pytest
from unittest.mock import patch, MagicMock
from datalens_ai.agent.graph import AnalysisPlan
from datalens_ai.api.upload import file_store


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