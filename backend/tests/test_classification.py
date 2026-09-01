from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from datalens_ai.models.results import ClassificationResult
from datalens_ai.tools.classification import run_classification

_WINE = Path(__file__).resolve().parents[2] / "test_data" / "wine.csv"


def _separable(n: int = 60) -> pd.DataFrame:
    """Two well-separated blobs → any sane classifier scores ≥ 0.9 out-of-fold."""
    rng = np.random.default_rng(0)
    half = n // 2
    return pd.DataFrame({
        "x": np.concatenate([rng.normal(0, 0.5, half), rng.normal(10, 0.5, half)]),
        "y": np.concatenate([rng.normal(0, 0.5, half), rng.normal(10, 0.5, half)]),
        "label": [0] * half + [1] * half,
    })


def test_separable_two_class_data_scores_high():
    result = run_classification(_separable(), target_column="label")

    assert isinstance(result, ClassificationResult)
    assert result.type == "classification"
    assert result.target_name == "label"
    assert result.class_labels == ["0", "1"]
    assert result.n_classes == 2
    assert result.n_samples == 60
    assert result.cv_folds == 5
    assert result.cv_accuracy >= 0.9
    assert result.macro_f1 >= 0.9
    assert result.baseline_accuracy == 0.5
    assert result.feature_names == ["x", "y"]
    assert len(result.feature_importances) == 2
    assert abs(sum(result.feature_importances) - 1.0) < 0.01
    # Confusion matrix is n_classes × n_classes and accounts for every row.
    assert len(result.confusion_matrix) == 2
    assert all(len(row) == 2 for row in result.confusion_matrix)
    assert sum(sum(row) for row in result.confusion_matrix) == 60


def test_explicit_string_target():
    df = _separable()
    df["colour"] = ["red" if v == 0 else "blue" for v in df["label"]]
    df = df.drop(columns=["label"])

    result = run_classification(df, target_column="colour")

    assert result.target_name == "colour"
    assert result.class_labels == ["blue", "red"]  # sorted
    assert result.feature_names == ["x", "y"]
    assert result.cv_accuracy >= 0.9


def test_auto_picks_class_label_column_from_wine():
    df = pd.read_csv(_WINE)

    result = run_classification(df)

    assert result.target_name == "wine_class"
    assert result.n_classes == 3
    assert "wine_class" not in result.feature_names
    assert len(result.feature_names) == 13
    assert result.cv_accuracy > result.baseline_accuracy


def test_auto_picks_low_cardinality_string_column():
    df = _separable()
    df["kind"] = ["a" if v == 0 else "b" for v in df["label"]]
    df = df.drop(columns=["label"])
    # 'kind' is text with 2 unique values and ≥30 rows — qualifies as a target.
    assert run_classification(df).target_name == "kind"


def test_raises_when_no_target_available():
    df = pd.DataFrame({"x": np.arange(10, dtype=float), "y": np.arange(10, dtype=float) * 2})

    with pytest.raises(ValueError, match="class-label or low-cardinality"):
        run_classification(df)


def test_raises_with_single_class():
    df = pd.DataFrame({"x": np.arange(40, dtype=float), "label": [1] * 40})

    with pytest.raises(ValueError, match="at least 2 distinct classes"):
        run_classification(df, target_column="label")


def test_raises_for_unknown_target_column():
    with pytest.raises(ValueError, match="not found"):
        run_classification(_separable(), target_column="nope")


def test_raises_without_numeric_features():
    df = pd.DataFrame({"label": [0, 1] * 20})

    with pytest.raises(ValueError, match="numeric feature"):
        run_classification(df, target_column="label")
