import numpy as np
import pandas as pd

from datalens_ai.tools.regression import run_regression


def test_cv_r2_present_and_bounded_on_linear_data():
    rng = np.random.default_rng(0)
    x = np.arange(20, dtype=float)
    df = pd.DataFrame({"x": x, "y": 3 * x + 1 + rng.normal(0, 0.1, 20)})

    result = run_regression(df)

    assert result.n_samples == 20
    assert result.cv_r2_score is not None
    assert result.cv_r2_score <= 1.0 + 1e-9
    assert result.cv_r2_score > 0.9  # near-perfect line should generalise
    assert result.rmse >= 0.0
    assert result.rmse < 0.5


def test_cv_r2_is_none_with_too_few_rows():
    df = pd.DataFrame({"x": [1.0, 2.0, 3.0], "y": [2.0, 4.0, 6.0]})

    result = run_regression(df)

    assert result.cv_r2_score is None
    assert result.n_samples == 3
    assert result.r2_score > 0.99
