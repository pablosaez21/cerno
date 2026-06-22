from unittest.mock import AsyncMock, patch


def test_agent_chat_without_openai_key_returns_clear_error(client):
    with patch(
        "app.routers.agent.run_agent",
        new=AsyncMock(
            side_effect=RuntimeError("OPENAI_API_KEY is required for /agent/chat.")
        ),
    ):
        response = client.post("/agent/chat", json={"message": "hello"})

    assert response.status_code == 503
    assert response.json() == {
        "detail": "OPENAI_API_KEY is required for /agent/chat.",
    }
