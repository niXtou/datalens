from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    openrouter_api_key: str
    langsmith_api_key: str = ""
    langsmith_tracing: bool = False
    langsmith_project: str = "datalens-ai"
    environment: str = "development"

settings = Settings()