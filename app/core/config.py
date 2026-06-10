from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://cerno:cerno@localhost:5432/cerno"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    stockfish_path: str | None = None
    chroma_path: str = "data/chromadb"
    frontend_origin: str = "http://localhost:3000"
    backend_cors_origins: str = (
        "http://localhost:3000,http://127.0.0.1:3000"
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins(self) -> list[str]:
        origins = [
            origin.strip()
            for origin in self.backend_cors_origins.split(",")
            if origin.strip()
        ]
        if self.frontend_origin and self.frontend_origin not in origins:
            origins.append(self.frontend_origin)
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
