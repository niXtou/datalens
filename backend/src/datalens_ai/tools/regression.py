from sklearn.linear_model import LinearRegression
from sklearn.metrics import r2_score
import pandas as pd

def run_regression(df: pd.DataFrame) -> dict:
    
    X_full = df.select_dtypes(include="number").dropna()
    y = X_full.iloc[:, -1] # Assume the last numeric column is the target
    X = X_full.iloc[:, :-1] # Use the other numeric columns as features

    model = LinearRegression()
    model.fit(X, y)
    score = r2_score(y, model.predict(X))

    return {
        "coefficients": model.coef_.tolist(),
        "r2_score": float(score)
    }