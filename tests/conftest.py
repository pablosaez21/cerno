import pytest
from fastapi.testclient import TestClient

from app.db.session import get_db
from app.main import app


@pytest.fixture
def fake_db():
    return object()


@pytest.fixture
def client(fake_db):
    def override_get_db():
        yield fake_db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
