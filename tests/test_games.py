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


def test_analyze_pgn_clamps_stockfish_depth(client):
    analyze_game = AsyncMock(return_value={"total_moves": 0})

    with patch("app.routers.games.analyze_game", new=analyze_game):
        response = client.post(
            "/games/analyze",
            json={"pgn": "[Event \"Test\"]\n\n1. e4 *", "depth": 15},
        )

    assert response.status_code == 200
    analyze_game.assert_awaited_once_with("[Event \"Test\"]\n\n1. e4 *", 10)
