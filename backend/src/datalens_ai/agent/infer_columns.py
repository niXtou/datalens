import pandas as pd
from datalens_ai.models.upload import ColumnSchema, ColumnType

def infer_columns(df: pd.DataFrame) -> list[ColumnSchema]:
    column_schemas = []

    for col in df.columns:
        if pd.api.types.is_numeric_dtype(df[col].dtype):
            column_type = ColumnType.numeric
        elif pd.api.types.is_datetime64_any_dtype(df[col].dtype):
            column_type = ColumnType.datetime
        else:
            parsed = pd.to_datetime(df[col], errors='coerce', format="mixed")
            if parsed.notna().mean() >= 0.8: # 80% of values parsed successfully
                column_type = ColumnType.datetime
            else:
                column_type = ColumnType.categorical
        
        column_schemas.append(ColumnSchema(name=col, column_type=column_type))
    
    return column_schemas
    