from sklearn.ensemble import IsolationForest
import numpy as np
import pandas as pd
from datalens_ai.models.results import AnomalyResult

def run_anomaly(df: pd.DataFrame) -> AnomalyResult:
    
    X = df.select_dtypes(include="number").dropna()
    model = IsolationForest(random_state=42)
    indices = (model.fit_predict(X) == -1).nonzero()[0]
    rate = len(indices) / len(X)

    return AnomalyResult(
        anomaly_indices=indices.tolist(),
        contamination_rate=float(rate)
    )