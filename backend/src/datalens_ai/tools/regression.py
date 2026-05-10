import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import r2_score

from datalens_ai.models.results import RegressionResult


def run_regression(df: pd.DataFrame) -> RegressionResult:
    X_full = df.select_dtypes(include="number").dropna()
    if X_full.shape[1] < 2:
        raise ValueError("Regression requires at least 2 numeric columns.")
    y = X_full.iloc[:, -1]  # last numeric column is the target
    X = X_full.iloc[:, :-1]
    model = LinearRegression()
    model.fit(X, y)
    score = r2_score(y, model.predict(X))
    return RegressionResult(coefficients=model.coef_.tolist(), r2_score=float(score))
