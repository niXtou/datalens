from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    openrouter_api_key: str
    langchain_api_key: str = ""
    langchain_tracing_v2: bool = False
    langchain_project: str = "datalens-ai"
    environment: str = "development"

settings = Settings()