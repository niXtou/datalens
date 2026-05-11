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


def test_bool_column_is_categorical():
    df = pd.DataFrame({"active": [True, False, True, True, False]})
    result = infer_columns(df)

    assert result[0].column_type == ColumnType.categorical


def test_low_cardinality_int_is_class_label():
    df = pd.DataFrame({"label": list(range(3)) * 10})  # 30 rows, 3 unique ints
    result = infer_columns(df)

    assert result[0].column_type == ColumnType.class_label


def test_low_cardinality_int_small_dataset_is_numeric():
    # Fewer than 30 rows → not enough to be confident it's a class label
    df = pd.DataFrame({"label": list(range(3)) * 9})  # 27 rows
    result = infer_columns(df)

    assert result[0].column_type == ColumnType.numeric


def test_zero_row_csv_returns_schemas():
    df = pd.DataFrame(columns=["a", "b", "c"])
    result = infer_columns(df)

    assert len(result) == 3
    assert all(s.column_type == ColumnType.categorical for s in result)
