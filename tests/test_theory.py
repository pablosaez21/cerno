from unittest.mock import patch


def test_theory_search_returns_structured_results(client):
    search_result = {
        "text": "Develop pieces, control the center, and castle early.",
        "metadata": {
            "study_id": "study-1",
            "chapter": "Opening principles",
            "category": "opening_principles",
            "source": "https://lichess.org/study/study-1",
            "type": "lichess_study",
        },
        "distance": 0.24,
    }

    with patch(
        "app.routers.theory.search_theory",
        return_value=[search_result],
    ):
        response = client.post(
            "/theory/search",
            json={"query": "basic opening principles", "n_results": 3},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload == {"results": [search_result]}
