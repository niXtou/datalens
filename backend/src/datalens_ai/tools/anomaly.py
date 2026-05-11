import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from datalens_ai.models.results import AnomalyResult

_MAX_ROWS = 50  # cap stored row data to keep payload manageable


def run_anomaly(df: pd.DataFrame) -> AnomalyResult:
    X = df.select_dtypes(include="number").dropna().reset_index(drop=True)
    model = IsolationForest(random_state=42)
    predictions = model.fit_predict(X)
    flagged = np.where(predictions == -1)[0]
    rate = len(flagged) / len(X)

    rows = X.iloc[flagged[:_MAX_ROWS]].round(4).to_dict(orient="records")

    # Per-column mean and std from the full dataset — used by the frontend to
    # highlight cells that are unusually extreme (|z| > 2).
    stats = {
        col: {"mean": round(float(X[col].mean()), 4), "std": round(float(X[col].std()), 4)}
        for col in X.columns
    }

    return AnomalyResult(
        anomaly_indices=flagged.tolist(),
        contamination_rate=float(rate),
        anomaly_rows=rows,
        feature_stats=stats,
    )
