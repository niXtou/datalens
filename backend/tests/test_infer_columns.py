import numpy as np
import pandas as pd

from datalens_ai.agent.infer_columns import infer_columns, profile_column
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

    age = result[0].profile
    assert age.missing_count == 0
    assert age.missing_pct == 0.0
    assert age.unique_count == 3
    assert age.mean == 30.0
    assert age.min == 25.0
    assert age.max == 35.0
    assert age.std == 5.0
    assert age.top_values is None
    assert age.min_date is None

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

    name = result[0].profile
    assert name.unique_count == 2
    assert name.top_values is not None
    assert [(t.value, t.count) for t in name.top_values] == [("Alice", 1), ("Bob", 1)]
    assert name.mean is None

    date = result[2].profile
    assert date.min_date == "2024-01-15"
    assert date.max_date == "2024-03-22"
    assert date.top_values is None

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
    profile = result[0].profile
    assert profile.unique_count == 3
    assert profile.min == 0.0
    assert profile.max == 2.0
    assert profile.mean == 1.0


def test_profile_counts_missing_values_and_top_values():
    df = pd.DataFrame({
        "city": ["Oslo", "Oslo", "Rome", None, "Oslo", "Bergen", "Rome", None],
        "value": [1.0, np.nan, 3.0, 4.0, np.nan, 6.0, 7.0, 8.0],
    })
    result = infer_columns(df)

    city = result[0].profile
    assert city.missing_count == 2
    assert city.missing_pct == 25.0
    assert city.unique_count == 3
    assert city.top_values is not None
    assert [(t.value, t.count) for t in city.top_values] == [("Oslo", 3), ("Rome", 2), ("Bergen", 1)]

    value = result[1].profile
    assert value.missing_count == 2
    assert value.missing_pct == 25.0
    assert value.mean == 4.8333  # rounded to 4 dp, NaNs ignored


def test_profile_column_handles_all_missing():
    series = pd.Series([None, None], dtype="float64")
    profile = profile_column(series, ColumnType.numeric)

    assert profile.missing_count == 2
    assert profile.missing_pct == 100.0
    assert profile.unique_count == 0
    assert profile.mean is None


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
    assert all(s.profile.missing_pct == 0.0 for s in result)
