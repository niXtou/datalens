import pandas as pd
from datalens_ai.models.upload import ColumnSchema, ColumnType


def infer_columns(df: pd.DataFrame) -> list[ColumnSchema]:
    column_schemas = []

    for col in df.columns:
        series = df[col]
        if pd.api.types.is_numeric_dtype(series.dtype):
            # Low-cardinality integer columns with enough rows are almost always
            # class labels or binary flags, not continuous quantities. We require
            # at least 30 rows to avoid misclassifying small sample datasets.
            if (
                pd.api.types.is_integer_dtype(series.dtype)
                and series.nunique() <= 10
                and len(series.dropna()) >= 30
            ):
                column_type = ColumnType.categorical
            else:
                column_type = ColumnType.numeric
        elif pd.api.types.is_datetime64_any_dtype(series.dtype):
            column_type = ColumnType.datetime
        else:
            parsed = pd.to_datetime(series, errors='coerce', format="mixed")
            if parsed.notna().mean() >= 0.8:
                column_type = ColumnType.datetime
            else:
                column_type = ColumnType.categorical

        column_schemas.append(ColumnSchema(name=col, column_type=column_type))

    return column_schemas
