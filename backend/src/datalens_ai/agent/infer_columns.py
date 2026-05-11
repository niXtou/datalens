import pandas as pd
from datalens_ai.models.upload import ColumnSchema, ColumnType
from datalens_ai.tools.utils import is_class_label

_DATETIME_PARSE_THRESHOLD = 0.8  # fraction of values that must parse as dates


def infer_columns(df: pd.DataFrame) -> list[ColumnSchema]:
    column_schemas = []

    for col in df.columns:
        series = df[col]
        if pd.api.types.is_bool_dtype(series.dtype):
            column_type = ColumnType.categorical
        elif pd.api.types.is_numeric_dtype(series.dtype):
            if is_class_label(series):
                column_type = ColumnType.class_label
            else:
                column_type = ColumnType.numeric
        elif pd.api.types.is_datetime64_any_dtype(series.dtype):
            column_type = ColumnType.datetime
        else:
            parsed = pd.to_datetime(series, errors='coerce', format="mixed")
            if parsed.notna().mean() >= _DATETIME_PARSE_THRESHOLD:
                column_type = ColumnType.datetime
            else:
                column_type = ColumnType.categorical

        column_schemas.append(ColumnSchema(name=col, column_type=column_type))

    return column_schemas
