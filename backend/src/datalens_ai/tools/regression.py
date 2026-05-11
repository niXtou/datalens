import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import r2_score

from datalens_ai.models.results import RegressionResult
from datalens_ai.tools.utils import sample_indices


def _is_class_label(series: pd.Series) -> bool:
    """True for integer columns with few unique values and enough rows to be sure."""
    return (
        pd.api.types.is_integer_dtype(series.dtype)
        and series.nunique() <= 10
        and len(series.dropna()) >= 30
    )


def run_regression(df: pd.DataFrame) -> RegressionResult:
    numeric = df.select_dtypes(include="number").dropna()

    # Drop likely class-label columns so they are never used as regression target
    # or features. A class label treated as a continuous quantity produces a
    # plausible-looking R² but meaningless coefficients.
    continuous = numeric[[col for col in numeric.columns if not _is_class_label(numeric[col])]]
    if continuous.shape[1] < 2:
        raise ValueError("Regression requires at least 2 continuous numeric columns.")

    y = continuous.iloc[:, -1]   # last continuous column is the target
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
        target_name=str(y.name),
        r2_score=float(score),
        actuals=y.iloc[idx].tolist(),
        predicted=y_pred[idx].tolist(),
    )
