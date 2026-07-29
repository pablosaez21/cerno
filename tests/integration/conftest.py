from __future__ import annotations

import os
import shutil
from collections.abc import Callable, Generator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.core.config import settings

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PGN_FIXTURE_ROOT = PROJECT_ROOT / "tests" / "integration" / "fixtures"
DEFAULT_TEST_DATABASE_URL = (
    "postgresql+psycopg://cerno_test:cerno_test@localhost:55432/cerno_test"
)


def require_safe_test_database_url(raw_url: str) -> str:
    """Reject any PostgreSQL target that is not unmistakably local test data."""
    url = make_url(raw_url)
    if url.get_backend_name() != "postgresql":
        raise pytest.UsageError("PostgreSQL integration tests require PostgreSQL.")
    if url.database != "cerno_test":
        raise pytest.UsageError(
            "Refusing to reset a database not named exactly 'cerno_test'."
        )
    if url.host not in {"localhost", "127.0.0.1", "::1"}:
        raise pytest.UsageError(
            "Refusing to reset a non-local PostgreSQL integration database."
        )
    if url == make_url(settings.sqlalchemy_database_url):
        raise pytest.UsageError(
            "Refusing to reset the database configured for the Cerno application."
        )
    return raw_url


def reset_public_schema(database_url: str) -> None:
    engine = create_engine(database_url, isolation_level="AUTOCOMMIT")
    try:
        with engine.connect() as connection:
            connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
            connection.execute(text("CREATE SCHEMA public"))
    finally:
        engine.dispose()


def upgrade_to_head(database_url: str) -> None:
    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(PROJECT_ROOT / "migrations"))
    config.attributes["database_url"] = database_url
    command.upgrade(config, "head")


@pytest.fixture
def postgres_database_url() -> str:
    configured_url = os.getenv(
        "TEST_DATABASE_URL",
        DEFAULT_TEST_DATABASE_URL,
    )
    return require_safe_test_database_url(configured_url)


@pytest.fixture
def migrated_database_url(postgres_database_url: str) -> Generator[str]:
    reset_public_schema(postgres_database_url)
    upgrade_to_head(postgres_database_url)
    try:
        yield postgres_database_url
    finally:
        reset_public_schema(postgres_database_url)


@pytest.fixture
def db_session(migrated_database_url: str) -> Generator[Session]:
    engine = create_engine(migrated_database_url, pool_pre_ping=True)
    session = Session(engine)
    try:
        yield session
    finally:
        session.rollback()
        session.close()
        engine.dispose()


@pytest.fixture
def stockfish_binary() -> Path:
    candidates = [
        os.getenv("TEST_STOCKFISH_PATH"),
        os.getenv("STOCKFISH_PATH"),
        str(PROJECT_ROOT / "engines" / "stockfish.exe"),
        shutil.which("stockfish"),
        "/usr/games/stockfish",
        "/usr/bin/stockfish",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return Path(candidate).resolve()

    pytest.fail(
        "A real Stockfish binary is required. Set TEST_STOCKFISH_PATH or "
        "place the Windows binary at engines/stockfish.exe."
    )


@pytest.fixture
def load_pgn() -> Callable[[str], str]:
    def load(name: str) -> str:
        return (PGN_FIXTURE_ROOT / name).read_text(encoding="utf-8")

    return load
