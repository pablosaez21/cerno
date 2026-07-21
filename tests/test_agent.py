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


def test_index_study_passes_category_to_rag_service(client):
    with patch(
        "app.routers.agent.index_study",
        new=AsyncMock(return_value=12),
    ) as index_study:
        response = client.post(
            "/agent/index-study",
            json={
                "study_id": "KjivNw7F",
                "category": "opening_repertoire",
            },
        )

    assert response.status_code == 200
    assert response.json() == {
        "indexed_chunks": 12,
        "study_id": "KjivNw7F",
        "category": "opening_repertoire",
    }
    index_study.assert_awaited_once_with(
        "KjivNw7F",
        category="opening_repertoire",
    )
