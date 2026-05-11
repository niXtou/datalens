import numpy as np
import pandas as pd

from datalens_ai.config import SCATTER_SAMPLE

RANDOM_STATE = 42

# Thresholds for detecting class-label integers (e.g. category IDs, wine classes).
CLASS_LABEL_MAX_UNIQUE = 10
CLASS_LABEL_MIN_ROWS   = 30


def is_class_label(series: pd.Series) -> bool:
    """True for integer columns with few unique values and enough rows to be confident."""
    return (
        pd.api.types.is_integer_dtype(series.dtype)
        and series.nunique() <= CLASS_LABEL_MAX_UNIQUE
        and len(series.dropna()) >= CLASS_LABEL_MIN_ROWS
    )


def sample_indices(n: int) -> np.ndarray:
    """Return a sorted index array of up to SCATTER_SAMPLE positions in [0, n).

    A fresh RNG is seeded at 42 on every call so the same dataset always
    produces the same chart points regardless of how many prior analyses
    have run in this process.
    """
    if n > SCATTER_SAMPLE:
        return np.sort(np.random.default_rng(42).choice(n, size=SCATTER_SAMPLE, replace=False))
    return np.arange(n)
