import pandas as pd
from datalens_ai.models.upload import ColumnProfile, ColumnSchema, ColumnType, TopValue
from datalens_ai.tools.utils import is_class_label

_DATETIME_PARSE_THRESHOLD = 0.8  # fraction of values that must parse as dates
_TOP_VALUES = 3
_STAT_PRECISION = 4


def _infer_type(series: pd.Series) -> tuple[ColumnType, pd.Series | None]:
    """Return the column type plus the parsed datetime series when one was needed."""
    if pd.api.types.is_bool_dtype(series.dtype):
        return ColumnType.categorical, None
    if pd.api.types.is_numeric_dtype(series.dtype):
        return (ColumnType.class_label if is_class_label(series) else ColumnType.numeric), None
    if pd.api.types.is_datetime64_any_dtype(series.dtype):
        return ColumnType.datetime, series
    parsed = pd.to_datetime(series, errors='coerce', format="mixed")
    if parsed.notna().mean() >= _DATETIME_PARSE_THRESHOLD:
        return ColumnType.datetime, parsed
    return ColumnType.categorical, None


def _stat(value: float) -> float | None:
    return None if pd.isna(value) else round(float(value), _STAT_PRECISION)


def profile_column(
    series: pd.Series, column_type: ColumnType, parsed_dates: pd.Series | None = None
) -> ColumnProfile:
    """Summarise a column: missingness, cardinality, and type-specific descriptive stats."""
    n = len(series)
    missing = int(series.isna().sum())
    profile = ColumnProfile(
        missing_count=missing,
        missing_pct=round(missing / n * 100, 1) if n else 0.0,
        unique_count=int(series.nunique()),
    )
    non_null = series.dropna()
    if non_null.empty:
        return profile

    if column_type in (ColumnType.numeric, ColumnType.class_label):
        profile.mean = _stat(non_null.mean())
        profile.std = _stat(non_null.std())
        profile.min = _stat(non_null.min())
        profile.max = _stat(non_null.max())
    elif column_type == ColumnType.datetime:
        dates = (parsed_dates if parsed_dates is not None else series).dropna()
        if not dates.empty:
            profile.min_date = dates.min().date().isoformat()
            profile.max_date = dates.max().date().isoformat()
    else:
        counts = non_null.astype(str).value_counts().head(_TOP_VALUES)
        profile.top_values = [
            TopValue(value=str(value), count=int(count)) for value, count in counts.items()
        ]
    return profile


def infer_columns(df: pd.DataFrame) -> list[ColumnSchema]:
    column_schemas = []

    for col in df.columns:
        series = df[col]
        column_type, parsed = _infer_type(series)
        column_schemas.append(ColumnSchema(
            name=col,
            column_type=column_type,
            profile=profile_column(series, column_type, parsed),
        ))

    return column_schemas
