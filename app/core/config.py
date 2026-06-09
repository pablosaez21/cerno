from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://cerno:cerno@localhost:5432/cerno"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    stockfish_path: str | None = None
    chroma_path: str = "data/chromadb"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
