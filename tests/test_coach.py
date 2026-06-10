from unittest.mock import AsyncMock, patch

from app.schemas.game import Game, Player


def test_analyze_user_returns_structured_coaching_response(client):
    game = Game(
        id="game-1",
        speed="rapid",
        rated=True,
        winner="white",
        status="mate",
        white=Player(username="test-user", rating=1500),
        black=Player(username="opponent", rating=1490),
        moves="e4 e5 Nf3",
        pgn='[Event "Test"]\n\n1. e4 e5 2. Nf3 *',
    )
    analysis = {
        "total_moves": 3,
        "summary": {},
        "moves": [
            {"phase": "opening", "cpl": 20, "classification": "good"},
            {"phase": "middlegame", "cpl": 170, "classification": "mistake"},
            {"phase": "middlegame", "cpl": 340, "classification": "blunder"},
        ],
        "critical_moments": [
            {
                "move_number": 2,
                "move_uci": "g1f3",
                "move_san": "Nf3",
                "phase": "middlegame",
                "evaluation_before": 0.4,
                "evaluation_after": -3.0,
                "cpl": 340,
                "classification": "blunder",
                "fen_before": "before",
                "fen_after": "after",
            }
        ],
        "phase_weaknesses": ["middlegame"],
    }
    theory_result = {
        "text": "Coordinate pieces and check forcing moves.",
        "metadata": {
            "study_id": "study-1",
            "chapter": "Middlegame plans",
            "category": "general_openings",
            "source": "https://lichess.org/study/study-1",
            "type": "lichess_study",
        },
        "distance": 0.31,
    }
    training_plan = {
        "priority": "middlegame tactics",
        "week_plan": ["Solve tactical positions.", "Review the critical move."],
    }

    with (
        patch(
            "app.services.coach.fetch_games",
            new=AsyncMock(return_value=[game]),
        ),
        patch(
            "app.services.coach.analyze_game",
            new=AsyncMock(return_value=analysis),
        ),
        patch(
            "app.services.coach.search_theory",
            return_value=[theory_result],
        ),
        patch(
            "app.services.coach.generate_training_plan",
            new=AsyncMock(return_value=training_plan),
        ),
    ):
        response = client.post(
            "/coach/analyze-user",
            json={
                "username": "test-user",
                "limit": 1,
                "depth": 1,
                "save": False,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["username"] == "test-user"
    assert payload["games_analyzed"] == 1
    assert payload["diagnosis"]["main_weakness"] == "middlegame"
    assert payload["critical_moments"][0]["classification"] == "blunder"
    assert payload["theory_recommendations"][0]["study_id"] == "study-1"
    assert payload["training_plan"] == training_plan
    assert payload["saved"] is False
