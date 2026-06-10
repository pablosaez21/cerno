from unittest.mock import AsyncMock, patch


def test_analyze_invalid_pgn_returns_controlled_error(client):
    with patch(
        "app.routers.games.analyze_game",
        new=AsyncMock(side_effect=ValueError("Invalid PGN: no moves found.")),
    ):
        response = client.post(
            "/games/analyze",
            json={"pgn": "not a pgn", "depth": 1},
        )

    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid PGN: no moves found."}
