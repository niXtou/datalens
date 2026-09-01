from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    openrouter_api_key: str
    # OpenRouter model id used for both planning and summarising.
    llm_model: str = "google/gemini-3.1-flash-lite-preview"
    langsmith_api_key: str = ""
    langsmith_tracing: bool = False
    langsmith_project: str = "datalens"
    environment: str = "development"
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]
    max_upload_bytes: int = 10 * 1024 * 1024  # 10 MB
    # Uploaded CSVs and persisted results older than this are swept periodically.
    file_retention_hours: int = 24


settings = Settings()

# Maximum number of data points sent to the frontend per chart series.
# Keeps payload size and render time reasonable without losing visual fidelity.
SCATTER_SAMPLE = 300
