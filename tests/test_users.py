from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch


def test_user_analyses_returns_repository_data(client):
    analysis = SimpleNamespace(
        id=1,
        lichess_game_id="game-1",
        opponent="opponent",
        color_played="white",
        result="win",
        opening_name="Italian Game",
        total_moves=42,
        analysis_summary={"opening": {"avg_cpl": 25}},
        created_at=datetime(2026, 6, 9, tzinfo=timezone.utc),
    )

    with patch(
        "app.routers.users.get_user_analyses",
        return_value=[analysis],
    ):
        response = client.get("/users/test-user/analyses")

    assert response.status_code == 200
    payload = response.json()
    assert payload["username"] == "test-user"
    assert payload["total"] == 1
    assert payload["analyses"][0]["lichess_game_id"] == "game-1"


def test_weakness_profile_returns_repository_data(client):
    profile = SimpleNamespace(
        games_analyzed=3,
        main_weakness="middlegame",
        profile_data={
            "phase_stats": {"middlegame": {"avg_cpl": 120}},
            "detected_patterns": ["missed tactics"],
            "recommended_focus": ["middlegame tactics"],
        },
    )
    recommendation = SimpleNamespace(
        title="Train middlegame tactics",
        priority="high",
    )

    with (
        patch(
            "app.routers.users.get_user_weakness_profile",
            return_value=profile,
        ),
        patch(
            "app.routers.users.get_user_recommendations",
            return_value=[recommendation],
        ),
    ):
        response = client.get("/users/test-user/weakness-profile")

    assert response.status_code == 200
    payload = response.json()
    assert payload["main_weakness"] == "middlegame"
    assert payload["detected_patterns"] == ["missed tactics"]
    assert payload["recommended_training"][0]["priority"] == "high"
