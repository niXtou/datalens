import numpy as np

from datalens_ai.config import SCATTER_SAMPLE

# Single seeded RNG instance — deterministic sampling ensures the same rows
# are selected on repeated calls, which keeps chart output stable across retries.
_RNG = np.random.default_rng(42)


def sample_indices(n: int) -> np.ndarray:
    """Return a sorted index array of up to SCATTER_SAMPLE positions in [0, n)."""
    if n > SCATTER_SAMPLE:
        return np.sort(_RNG.choice(n, size=SCATTER_SAMPLE, replace=False))
    return np.arange(n)
