from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
import pandas as pd
from datalens_ai.models.results import ClusteringResult

def run_clustering(df: pd.DataFrame) -> ClusteringResult:
    
    X = df.select_dtypes(include="number").dropna()
    
    labels = KMeans(n_clusters=3, random_state=42).fit_predict(X)
    score = silhouette_score(X, labels)

    return ClusteringResult(
        cluster_labels=labels.tolist(),
        silhouette_score=float(score)
    )