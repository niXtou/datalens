import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score

from datalens_ai.models.results import ClusteringResult


def run_clustering(df: pd.DataFrame) -> ClusteringResult:
    X = df.select_dtypes(include="number").dropna()
    if len(X) < 2:
        raise ValueError("Clustering requires at least 2 rows of numeric data.")
    n_clusters = min(3, len(X))
    labels = KMeans(n_clusters=n_clusters, random_state=42).fit_predict(X)
    score = silhouette_score(X, labels) if n_clusters > 1 else 0.0
    return ClusteringResult(cluster_labels=labels.tolist(), silhouette_score=float(score))
