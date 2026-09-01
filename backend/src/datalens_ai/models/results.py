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
    r2_score: float                # in-sample R² — optimistic, kept for continuity
    cv_r2_score: float | None      # mean 5-fold cross-validated R²; None when too few rows
    rmse: float                    # in-sample root mean squared error, in target units
    n_samples: int
    actuals: list[float]
    predicted: list[float]


class AnomalyResult(BaseModel):
    type: Literal["anomaly"] = "anomaly"
    anomaly_indices: list[int]
    contamination_rate: float
    anomaly_rows: list[dict[str, float]]
    feature_stats: dict[str, dict[str, float]]  # per-column {mean, std} for z-score highlighting


class CorrelationPair(BaseModel):
    feature_a: str
    feature_b: str
    r: float


class CorrelationResult(BaseModel):
    type: Literal["correlation"] = "correlation"
    columns: list[str]
    matrix: list[list[float]]      # Pearson r, same order as `columns` on both axes
    top_pairs: list[CorrelationPair]
    truncated: bool = False        # True when more numeric columns existed than were analysed


AnalysisResult = Annotated[
    ClusteringResult | RegressionResult | AnomalyResult | CorrelationResult,
    Field(discriminator="type"),
]


class ResultsResponse(BaseModel):
    results: dict[str, AnalysisResult]
    summary: str
