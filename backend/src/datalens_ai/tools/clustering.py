from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
import pandas as pd

def run_clustering(df: pd.DataFrame) -> dict:
    
    X = df.select_dtypes(include="number").dropna()
    
    labels = KMeans(n_clusters=3, random_state=42).fit_predict(X)
    score = silhouette_score(X, labels)

    return {
        "cluster_labels": labels.tolist(),
        "silhouette_score": float(score)
    }