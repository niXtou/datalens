import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

from datalens_ai.models.results import ClusteringResult
from datalens_ai.tools.utils import RANDOM_STATE, sample_indices

_MIN_CLUSTERS        = 2   # smallest k to consider
_MAX_CLUSTERS        = 6   # largest k to consider
_KMEANS_N_INIT       = 10  # KMeans restarts per k (higher = more stable)
_MIN_SILHOUETTE_ROWS = 4   # need ≥2 rows per cluster for silhouette to be valid


def _optimal_k(X_scaled: np.ndarray) -> int:
    """Return the k in [_MIN_CLUSTERS, min(_MAX_CLUSTERS, n_rows-1)] with the highest silhouette score."""
    best_k, best_score = _MIN_CLUSTERS, -1.0
    max_k = min(_MAX_CLUSTERS, len(X_scaled) - 1)
    for k in range(_MIN_CLUSTERS, max_k + 1):
        labels = KMeans(n_clusters=k, random_state=RANDOM_STATE, n_init=_KMEANS_N_INIT).fit_predict(X_scaled)
        score = silhouette_score(X_scaled, labels)
        if score > best_score:
            best_score, best_k = score, k
    return best_k


def run_clustering(df: pd.DataFrame) -> ClusteringResult:
    X = df.select_dtypes(include="number").dropna().reset_index(drop=True)
    if len(X) < _MIN_CLUSTERS:
        raise ValueError("Clustering requires at least 2 rows of numeric data.")

    # Scale before clustering so no single high-variance feature dominates.
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    n_clusters = _optimal_k(X_scaled) if len(X) >= _MIN_SILHOUETTE_ROWS else min(_MIN_CLUSTERS, len(X))
    labels = KMeans(n_clusters=n_clusters, random_state=RANDOM_STATE, n_init=_KMEANS_N_INIT).fit_predict(X_scaled)
    score = silhouette_score(X_scaled, labels) if n_clusters > 1 else 0.0

    cols = X.columns.tolist()
    pca_projection = len(cols) > 2

    if pca_projection:
        # PCA on scaled data — chart reflects the true cluster geometry.
        pca = PCA(n_components=2, random_state=RANDOM_STATE)
        coords = pca.fit_transform(X_scaled)
        var = pca.explained_variance_ratio_
        x_coords = coords[:, 0]
        y_coords = coords[:, 1]
        feature_x = f"PC1 ({var[0] * 100:.1f}% var)"
        feature_y = f"PC2 ({var[1] * 100:.1f}% var)"
    elif len(cols) == 2:
        # Non-PCA: use original (unscaled) values so axes show interpretable units.
        x_coords = X[cols[0]].values.astype(float)
        y_coords = X[cols[1]].values.astype(float)
        feature_x, feature_y = cols[0], cols[1]
    else:
        x_coords = X[cols[0]].values.astype(float)
        y_coords = np.arange(len(X), dtype=float)
        feature_x, feature_y = cols[0], "Row index"
        pca_projection = False

    idx = sample_indices(len(X))

    return ClusteringResult(
        cluster_labels=[int(labels[i]) for i in idx],
        silhouette_score=float(score),
        n_clusters=n_clusters,
        feature_x=feature_x,
        feature_y=feature_y,
        x_values=x_coords[idx].tolist(),
        y_values=y_coords[idx].tolist(),
        pca_projection=pca_projection,
    )
