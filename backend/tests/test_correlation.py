import numpy as np
import pandas as pd
import pytest

from datalens_ai.models.results import CorrelationResult
from datalens_ai.tools.correlation import run_correlation


def test_perfectly_correlated_pair_is_top():
    df = pd.DataFrame({
        "a": [1.0, 2.0, 3.0, 4.0, 5.0],
        "b": [2.0, 4.0, 6.0, 8.0, 10.0],
        "c": [5.0, 1.0, 4.0, 2.0, 3.0],
    })

    result = run_correlation(df)

    assert isinstance(result, CorrelationResult)
    assert result.type == "correlation"
    assert result.columns == ["a", "b", "c"]
    assert len(result.matrix) == 3 and all(len(row) == 3 for row in result.matrix)
    assert all(result.matrix[i][i] == 1.0 for i in range(3))
    top = result.top_pairs[0]
    assert {top.feature_a, top.feature_b} == {"a", "b"}
    assert top.r == 1.0
    # 3 columns → 3 unique unordered pairs, sorted by |r| descending.
    assert len(result.top_pairs) == 3
    strengths = [abs(p.r) for p in result.top_pairs]
    assert strengths == sorted(strengths, reverse=True)
    assert not result.truncated


def test_constant_column_gives_zero_not_nan():
    df = pd.DataFrame({"a": [1.0, 2.0, 3.0, 4.0], "const": [7.0, 7.0, 7.0, 7.0]})

    result = run_correlation(df)

    idx = result.columns.index("const")
    assert result.matrix[0][idx] == 0.0
    assert all(not np.isnan(v) for row in result.matrix for v in row)
    assert result.top_pairs[0].r == 0.0


def test_fewer_than_two_numeric_columns_raises():
    df = pd.DataFrame({"a": [1.0, 2.0, 3.0], "name": ["x", "y", "z"]})

    with pytest.raises(ValueError, match="at least 2 numeric"):
        run_correlation(df)


def test_too_few_rows_raises():
    df = pd.DataFrame({"a": [1.0, 2.0], "b": [3.0, 4.0]})

    with pytest.raises(ValueError, match="at least 3 rows"):
        run_correlation(df)


def test_truncates_to_first_30_columns_and_caps_top_pairs():
    rng = np.random.default_rng(1)
    df = pd.DataFrame(rng.normal(size=(20, 35)), columns=[f"c{i}" for i in range(35)])

    result = run_correlation(df)

    assert result.truncated
    assert len(result.columns) == 30
    assert result.columns[0] == "c0"
    assert len(result.top_pairs) == 10
