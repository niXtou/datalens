import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import confusion_matrix, f1_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict, cross_val_score

from datalens_ai.models.results import ClassificationResult
from datalens_ai.tools.utils import (
    CLASS_LABEL_MAX_UNIQUE,
    CLASS_LABEL_MIN_ROWS,
    RANDOM_STATE,
    is_class_label,
)

_N_ESTIMATORS       = 200
_MAX_FOLDS          = 5
_MIN_CLASSES        = 2
_MIN_PER_CLASS      = 2  # StratifiedKFold needs ≥2 samples per class for ≥2 folds
_PRECISION          = 4

_NO_TARGET_MESSAGE = (
    "Classification requires a class-label or low-cardinality categorical target column."
)


def _pick_target(df: pd.DataFrame) -> str | None:
    """Auto-select a target: first class_label int column, else a small categorical column."""
    for col in df.columns:
        if pd.api.types.is_numeric_dtype(df[col].dtype) and is_class_label(df[col]):
            return str(col)
    for col in df.columns:
        series = df[col]
        is_text = pd.api.types.is_object_dtype(series.dtype) or isinstance(
            series.dtype, pd.StringDtype
        )
        if not (is_text or pd.api.types.is_bool_dtype(series.dtype)):
            continue
        nunique = series.nunique()
        if _MIN_CLASSES <= nunique <= CLASS_LABEL_MAX_UNIQUE and series.count() >= CLASS_LABEL_MIN_ROWS:
            return str(col)
    return None


def run_classification(df: pd.DataFrame, target_column: str | None = None) -> ClassificationResult:
    if target_column is not None:
        if target_column not in df.columns:
            raise ValueError(f"Target column '{target_column}' not found in the dataset.")
        target = target_column
    else:
        target = _pick_target(df)
        if target is None:
            raise ValueError(_NO_TARGET_MESSAGE)

    features = [c for c in df.select_dtypes(include="number").columns if c != target]
    if not features:
        raise ValueError("Classification requires at least 1 numeric feature column.")

    data = df[features + [target]].dropna()
    X = data[features]
    y = data[target].astype(str)

    counts = y.value_counts()
    if len(counts) < _MIN_CLASSES:
        raise ValueError("Classification requires at least 2 distinct classes in the target.")
    if int(counts.min()) < _MIN_PER_CLASS:
        raise ValueError("Every class needs at least 2 rows for cross-validation.")

    labels = sorted(counts.index.tolist())
    n_folds = min(_MAX_FOLDS, int(counts.min()))
    splitter = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=RANDOM_STATE)
    model = RandomForestClassifier(n_estimators=_N_ESTIMATORS, random_state=RANDOM_STATE)

    # Out-of-fold predictions: every row is predicted by a model that never saw it.
    oof = cross_val_predict(model, X, y, cv=splitter)
    fold_scores = cross_val_score(model, X, y, cv=splitter)
    cv_accuracy = float(np.mean(oof == y.to_numpy()))
    macro_f1 = float(f1_score(y, oof, labels=labels, average="macro"))
    cm = confusion_matrix(y, oof, labels=labels)

    model.fit(X, y)

    return ClassificationResult(
        target_name=str(target),
        class_labels=labels,
        n_classes=len(labels),
        n_samples=int(len(y)),
        cv_folds=n_folds,
        cv_accuracy=round(cv_accuracy, _PRECISION),
        cv_accuracy_std=round(float(np.std(fold_scores)), _PRECISION),
        baseline_accuracy=round(float(counts.max() / len(y)), _PRECISION),
        macro_f1=round(macro_f1, _PRECISION),
        confusion_matrix=cm.astype(int).tolist(),
        feature_names=[str(f) for f in features],
        feature_importances=[round(float(v), _PRECISION) for v in model.feature_importances_],
    )
