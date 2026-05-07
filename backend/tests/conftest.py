import pytest
from fastapi.testclient import TestClient
from datalens_ai.main import app


# Fixture: reusable setup injected into any test that declares "client" as a parameter.
# TestClient wraps the FastAPI app so tests make real HTTP requests without a running server.
@pytest.fixture
def client():
    return TestClient(app)
