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
    max_games_per_analysis: int = 3
    max_stockfish_depth: int = 10

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

    @property
    def sqlalchemy_database_url(self) -> str:
        if self.database_url.startswith("postgresql://"):
            return self.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
        return self.database_url

    def clamp_games_limit(self, limit: int) -> int:
        return max(1, min(limit, self.max_games_per_analysis))

    def clamp_stockfish_depth(self, depth: int) -> int:
        return max(1, min(depth, self.max_stockfish_depth))


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
