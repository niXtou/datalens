import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import r2_score

from datalens_ai.models.results import RegressionResult
from datalens_ai.tools.utils import is_class_label, sample_indices


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
        actuals=y.iloc[idx].tolist(),
        predicted=y_pred[idx].tolist(),
    )
