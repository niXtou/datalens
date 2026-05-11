import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from datalens_ai.models.results import AnomalyResult
from datalens_ai.tools.utils import RANDOM_STATE

_MAX_ROWS       = 50  # cap stored row data to keep payload manageable
_ZSCORE_THRESHOLD = 2   # |z| > this flags a cell as extreme in the frontend
_STAT_PRECISION   = 4   # decimal places for per-column mean/std


def run_anomaly(df: pd.DataFrame) -> AnomalyResult:
    X = df.select_dtypes(include="number").dropna().reset_index(drop=True)
    if X.empty:
        raise ValueError("Anomaly detection requires at least one numeric column with data.")
    model = IsolationForest(random_state=RANDOM_STATE)
    predictions = model.fit_predict(X)
    flagged = np.where(predictions == -1)[0]
    rate = len(flagged) / len(X)

    rows = X.iloc[flagged[:_MAX_ROWS]].round(_STAT_PRECISION).to_dict(orient="records")

    # Per-column mean and std — frontend uses _ZSCORE_THRESHOLD to highlight extreme cells.
    stats = {
        col: {
            "mean": round(float(X[col].mean()), _STAT_PRECISION),
            "std":  round(float(X[col].std()),  _STAT_PRECISION),
        }
        for col in X.columns
    }

    return AnomalyResult(
        anomaly_indices=flagged.tolist(),
        contamination_rate=float(rate),
        anomaly_rows=rows,
        feature_stats=stats,
    )
