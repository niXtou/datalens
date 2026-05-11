import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score

from datalens_ai.config import SCATTER_SAMPLE
from datalens_ai.models.results import ClusteringResult


def run_clustering(df: pd.DataFrame) -> ClusteringResult:
    X = df.select_dtypes(include="number").dropna().reset_index(drop=True)
    if len(X) < 2:
        raise ValueError("Clustering requires at least 2 rows of numeric data.")

    n_clusters = min(3, len(X))
    labels = KMeans(n_clusters=n_clusters, random_state=42).fit_predict(X)
    score = silhouette_score(X, labels) if n_clusters > 1 else 0.0

    cols = X.columns.tolist()
    feature_x = cols[0]
    # Use second numeric column for Y axis; fall back to row index if only one column.
    if len(cols) >= 2:
        feature_y = cols[1]
        y_source = X[feature_y]
    else:
        feature_y = "Row index"
        y_source = pd.Series(range(len(X)), name="Row index")

    n = len(X)
    if n > SCATTER_SAMPLE:
        idx = np.sort(np.random.default_rng(42).choice(n, size=SCATTER_SAMPLE, replace=False))
    else:
        idx = np.arange(n)

    return ClusteringResult(
        cluster_labels=[int(labels[i]) for i in idx],
        silhouette_score=float(score),
        n_clusters=n_clusters,
        feature_x=feature_x,
        feature_y=feature_y,
        x_values=X[feature_x].iloc[idx].tolist(),
        y_values=y_source.iloc[idx].tolist(),
    )
