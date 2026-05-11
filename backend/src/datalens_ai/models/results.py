from typing import Literal, Annotated
from pydantic import BaseModel, Field


class ClusteringResult(BaseModel):
    type: Literal["clustering"] = "clustering"
    cluster_labels: list[int]
    silhouette_score: float
    n_clusters: int
    feature_x: str
    feature_y: str
    x_values: list[float]
    y_values: list[float]
    pca_projection: bool = False


class RegressionResult(BaseModel):
    type: Literal["regression"] = "regression"
    coefficients: list[float]
    standardized_coefficients: list[float]
    feature_names: list[str]
    excluded_columns: list[str]
    target_name: str
    r2_score: float
    actuals: list[float]
    predicted: list[float]


class AnomalyResult(BaseModel):
    type: Literal["anomaly"] = "anomaly"
    anomaly_indices: list[int]
    contamination_rate: float
    anomaly_rows: list[dict[str, float]]
    feature_stats: dict[str, dict[str, float]]  # per-column {mean, std} for z-score highlighting


AnalysisResult = Annotated[
    ClusteringResult | RegressionResult | AnomalyResult,
    Field(discriminator="type"),
]


class ResultsResponse(BaseModel):
    results: dict[str, AnalysisResult]
    summary: str
