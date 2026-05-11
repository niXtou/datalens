import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import r2_score

from datalens_ai.models.results import RegressionResult
from datalens_ai.tools.utils import sample_indices


def run_regression(df: pd.DataFrame) -> RegressionResult:
    X_full = df.select_dtypes(include="number").dropna()
    if X_full.shape[1] < 2:
        raise ValueError("Regression requires at least 2 numeric columns.")

    y = X_full.iloc[:, -1]   # last numeric column is the target
    X = X_full.iloc[:, :-1]

    model = LinearRegression()
    model.fit(X, y)
    y_pred = model.predict(X)
    score = r2_score(y, y_pred)

    # Standardised coefficients: coef * std(Xᵢ) / std(y)
    # Comparable across features regardless of their original scale.
    x_std = X.std()
    y_std = float(y.std()) or 1.0
    std_coefs = (model.coef_ * x_std.values / y_std).tolist()

    idx = sample_indices(len(y))

    return RegressionResult(
        coefficients=model.coef_.tolist(),
        standardized_coefficients=std_coefs,
        feature_names=X.columns.tolist(),
        target_name=str(y.name),
        r2_score=float(score),
        actuals=y.iloc[idx].tolist(),
        predicted=y_pred[idx].tolist(),
    )
