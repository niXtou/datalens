import numpy as np
import pandas as pd

from datalens_ai.models.results import CorrelationPair, CorrelationResult

_MAX_COLUMNS = 30  # cap the matrix so the payload and heatmap stay readable
_MIN_COLUMNS = 2
_MIN_ROWS    = 3   # Pearson r on fewer rows is meaningless
_TOP_PAIRS   = 10
_PRECISION   = 3


def run_correlation(df: pd.DataFrame) -> CorrelationResult:
    numeric = df.select_dtypes(include="number")
    if numeric.shape[1] < _MIN_COLUMNS:
        raise ValueError("Correlation requires at least 2 numeric columns.")

    truncated = numeric.shape[1] > _MAX_COLUMNS
    numeric = numeric.iloc[:, :_MAX_COLUMNS]
    if len(numeric.dropna(how="all")) < _MIN_ROWS:
        raise ValueError("Correlation requires at least 3 rows of numeric data.")

    # Constant columns have zero variance → NaN r; report them as 0 (no linear relationship).
    corr = numeric.corr(method="pearson").fillna(0.0)
    matrix = np.round(corr.to_numpy(dtype=float), _PRECISION)
    columns = [str(c) for c in corr.columns]

    pairs = [
        CorrelationPair(feature_a=columns[i], feature_b=columns[j], r=float(matrix[i, j]))
        for i in range(len(columns))
        for j in range(i + 1, len(columns))
    ]
    pairs.sort(key=lambda p: abs(p.r), reverse=True)

    return CorrelationResult(
        columns=columns,
        matrix=matrix.tolist(),
        top_pairs=pairs[:_TOP_PAIRS],
        truncated=truncated,
    )
