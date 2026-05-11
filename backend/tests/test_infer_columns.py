import pandas as pd

from datalens_ai.agent.infer_columns import infer_columns
from datalens_ai.models.upload import ColumnType

def test_all_numeric():
    df = pd.DataFrame({
        "age": [30, 25, 35],
        "score": [9.5, 7.2, 8.8]
    })

    result = infer_columns(df)

    assert len(result) == 2
    assert result[0].name == "age"
    assert result[0].column_type == ColumnType.numeric
    assert result[1].name == "score"
    assert result[1].column_type == ColumnType.numeric

def test_mixed():
    df = pd.DataFrame({
        "name": ["Alice", "Bob"],
        "age": [30, 25],
        "signup_date": ["2024-01-15", "2024-03-22"]
    })
    result = infer_columns(df)

    assert len(result) == 3
    assert result[0].name == "name"
    assert result[0].column_type == ColumnType.categorical
    assert result[1].name == "age"
    assert result[1].column_type == ColumnType.numeric
    assert result[2].name == "signup_date"
    assert result[2].column_type == ColumnType.datetime

def test_datetime_as_string():
    df = pd.DataFrame({
        "event_date": ["2024-01-15", "2024-03-22", "2023-11-01", "2024-06-10", "not a date"]
    })
    result = infer_columns(df)

    assert len(result) == 1
    assert result[0].name == "event_date"
    assert result[0].column_type == ColumnType.datetime
