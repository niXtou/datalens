from typing import Literal, Annotated
from pydantic import BaseModel, Field

class ClusteringResult(BaseModel):
    type: Literal["clustering"] = "clustering"
    cluster_labels: list[int]
    silhouette_score: float

class RegressionResult(BaseModel):
    type: Literal["regression"] = "regression"
    coefficients: list[float]
    r2_score: float

class AnomalyResult(BaseModel):
    type: Literal["anomaly"] = "anomaly"
    anomaly_indices: list[int]
    contamination_rate: float


AnalysisResult = Annotated[ClusteringResult | RegressionResult | AnomalyResult, Field(discriminator="type")]

class ResultsResponse(BaseModel):
    results: dict[str, AnalysisResult]
    summary: str