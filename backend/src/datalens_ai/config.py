from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    openrouter_api_key: str
    langsmith_api_key: str = ""
    langsmith_tracing: bool = False
    langsmith_project: str = "datalens-ai"
    environment: str = "development"
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]
    max_upload_bytes: int = 10 * 1024 * 1024  # 10 MB


settings = Settings()

# Maximum number of data points sent to the frontend per chart series.
# Keeps payload size and render time reasonable without losing visual fidelity.
SCATTER_SAMPLE = 300
