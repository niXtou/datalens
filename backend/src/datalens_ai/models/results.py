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


class RegressionResult(BaseModel):
    type: Literal["regression"] = "regression"
    coefficients: list[float]
    feature_names: list[str]
    target_name: str
    r2_score: float
    actuals: list[float]
    predicted: list[float]


class AnomalyResult(BaseModel):
    type: Literal["anomaly"] = "anomaly"
    anomaly_indices: list[int]
    contamination_rate: float


AnalysisResult = Annotated[
    ClusteringResult | RegressionResult | AnomalyResult,
    Field(discriminator="type"),
]


class ResultsResponse(BaseModel):
    results: dict[str, AnalysisResult]
    summary: str
