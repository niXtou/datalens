import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import r2_score

from datalens_ai.config import SCATTER_SAMPLE
from datalens_ai.models.results import RegressionResult


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

    n = len(y)
    if n > SCATTER_SAMPLE:
        idx = np.sort(np.random.default_rng(42).choice(n, size=SCATTER_SAMPLE, replace=False))
    else:
        idx = np.arange(n)

    return RegressionResult(
        coefficients=model.coef_.tolist(),
        feature_names=X.columns.tolist(),
        target_name=str(y.name),
        r2_score=float(score),
        actuals=y.iloc[idx].tolist(),
        predicted=y_pred[idx].tolist(),
    )
