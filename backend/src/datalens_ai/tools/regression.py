import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error, r2_score
from sklearn.model_selection import KFold, cross_val_score

from datalens_ai.models.results import RegressionResult
from datalens_ai.tools.utils import RANDOM_STATE, is_class_label, sample_indices

_MAX_FOLDS   = 5
_MIN_CV_ROWS = 4  # below this a held-out fold is too small to score meaningfully
_MIN_CV_TEST = 2  # R² is undefined on a single held-out row, so cap folds at n_rows // 2


def run_regression(df: pd.DataFrame, target_column: str | None = None) -> RegressionResult:
    numeric = df.select_dtypes(include="number").dropna()

    # Drop likely class-label columns from features/target — except when the user
    # has explicitly chosen one as the regression target, in which case we keep it.
    excluded = [
        col for col in numeric.columns
        if is_class_label(numeric[col]) and col != target_column
    ]
    continuous = numeric[[col for col in numeric.columns if col not in excluded]]
    if continuous.shape[1] < 2:
        raise ValueError("Regression requires at least 2 continuous numeric columns.")

    # User-specified target takes priority; fall back to the last continuous column.
    if target_column and target_column in continuous.columns:
        y = continuous[target_column]
        X = continuous.drop(columns=[target_column])
    else:
        y = continuous.iloc[:, -1]
        X = continuous.iloc[:, :-1]

    model = LinearRegression()
    model.fit(X, y)
    y_pred = model.predict(X)
    score = r2_score(y, y_pred)
    rmse = float(np.sqrt(mean_squared_error(y, y_pred)))

    # Cross-validated R² is the honest number: each fold is scored on rows the
    # model never saw, so it cannot be inflated by memorising the training data.
    cv_r2: float | None = None
    if len(y) >= _MIN_CV_ROWS:
        n_splits = min(_MAX_FOLDS, len(y) // _MIN_CV_TEST)
        splitter = KFold(n_splits=n_splits, shuffle=True, random_state=RANDOM_STATE)
        scores = cross_val_score(LinearRegression(), X, y, cv=splitter, scoring="r2")
        mean_score = float(np.mean(scores))
        cv_r2 = None if np.isnan(mean_score) else mean_score

    # Standardised coefficients: coef × std(Xᵢ) / std(y)
    # Comparable across features regardless of their original scale.
    x_std = X.std()
    y_std = float(y.std()) or 1.0
    std_coefs = (model.coef_ * x_std.values / y_std).tolist()

    idx = sample_indices(len(y))

    return RegressionResult(
        coefficients=model.coef_.tolist(),
        standardized_coefficients=std_coefs,
        feature_names=X.columns.tolist(),
        excluded_columns=excluded,
        target_name=str(y.name),
        r2_score=float(score),
        cv_r2_score=cv_r2,
        rmse=rmse,
        n_samples=int(len(y)),
        actuals=y.iloc[idx].tolist(),
        predicted=y_pred[idx].tolist(),
    )
