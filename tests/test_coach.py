from unittest.mock import AsyncMock, patch

from app.schemas.game import Game, Player
from app.services.coach import remove_source_references


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
    assert payload["coach_advice"]
    assert payload["critical_moments"][0]["classification"] == "blunder"
    assert payload["theory_recommendations"][0]["study_id"] == "study-1"
    assert payload["training_plan"] == training_plan
    assert payload["saved"] is False


def test_remove_source_references_from_training_plan_steps():
    steps = [
        "Focus on middlegame tactics using study efGLGZOM.",
        "Practice calculation before forcing moves.",
    ]

    cleaned = remove_source_references(steps)

    assert "study efGLGZOM" not in cleaned[0]
    assert cleaned[1] == "Practice calculation before forcing moves."


def test_analyze_user_clamps_production_limits(client):
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
        "moves": [{"phase": "opening", "cpl": 20, "classification": "good"}],
        "critical_moments": [],
        "phase_weaknesses": [],
    }
    fetch_games = AsyncMock(return_value=[game])
    analyze_game = AsyncMock(return_value=analysis)

    with (
        patch("app.services.coach.fetch_games", new=fetch_games),
        patch("app.services.coach.analyze_game", new=analyze_game),
        patch("app.services.coach.search_theory", return_value=[]),
        patch(
            "app.services.coach.generate_training_plan",
            new=AsyncMock(
                return_value={
                    "priority": "opening improvement",
                    "week_plan": ["Review opening principles."],
                }
            ),
        ),
    ):
        response = client.post(
            "/coach/analyze-user",
            json={
                "username": "test-user",
                "limit": 10,
                "depth": 15,
                "save": False,
            },
        )

    assert response.status_code == 200
    fetch_games.assert_awaited_once_with("test-user", 3)
    analyze_game.assert_awaited_once_with(game.pgn, 10)
    assert response.json()["games_requested"] == 3
