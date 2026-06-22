from app.core.config import Settings


def test_database_url_normalizes_railway_postgres_scheme():
    settings = Settings(
        database_url="postgresql://user:password@host:5432/db",
    )

    assert (
        settings.sqlalchemy_database_url
        == "postgresql+psycopg://user:password@host:5432/db"
    )


def test_database_url_keeps_explicit_sqlalchemy_driver():
    settings = Settings(
        database_url="postgresql+psycopg://user:password@host:5432/db",
    )

    assert (
        settings.sqlalchemy_database_url
        == "postgresql+psycopg://user:password@host:5432/db"
    )
