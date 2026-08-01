from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.schemas.game import Game, Player
from app.schemas.rag import TheoryEvidence, TheoryRetrievalResult
from app.services.coach import (
    AnalyzedPlayerGame,
    collect_theory_results,
    detect_best_phase,
    persist_coach_result,
    remove_source_references,
)
from app.services.weakness import project_analysis_for_player


def retrieval_result(
    documents: list[TheoryEvidence] | None = None,
) -> TheoryRetrievalResult:
    return TheoryRetrievalResult(
        status="evidence_found" if documents else "insufficient_evidence",
        query="fixture query",
        pipeline_version="rag-v1",
        documents=documents or [],
    )


def test_theory_collection_passes_diagnosed_phase_to_retrieval():
    with patch(
        "app.services.coach.retrieve_theory",
        return_value=retrieval_result(),
    ) as search:
        assert (
            collect_theory_results(
                ["king safety principles"],
                phase="middlegame",
            )
            == []
        )

    search.assert_called_once_with(
        "king safety principles",
        n_results=3,
        phase="middlegame",
    )


def test_theory_collection_returns_distinct_studies():
    shared = {
        "text": "Educational study content.",
        "distance": 0.25,
    }
    documents = [
        TheoryEvidence(
            **shared,
            metadata={
                "source_id": "study-1",
                "study_id": "study-1",
                "chapter": "Chapter one",
                "source": "https://lichess.org/study/study-1",
            },
        ),
        TheoryEvidence(
            **shared,
            metadata={
                "source_id": "study-1",
                "study_id": "study-1",
                "chapter": "Chapter two",
                "source": "https://lichess.org/study/study-1",
            },
        ),
        TheoryEvidence(
            **shared,
            metadata={
                "source_id": "study-2",
                "study_id": "study-2",
                "chapter": "A different study",
                "source": "https://lichess.org/study/study-2",
            },
        ),
    ]

    with patch(
        "app.services.coach.retrieve_theory",
        return_value=retrieval_result(documents),
    ):
        results = collect_theory_results(["middlegame planning"])

    assert [item["metadata"]["source_id"] for item in results] == [
        "study-1",
        "study-2",
    ]


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
            {
                "mover_color": "white",
                "phase": "opening",
                "cpl": 20,
                "classification": "good",
            },
            {
                "mover_color": "black",
                "phase": "middlegame",
                "cpl": 170,
                "classification": "mistake",
            },
            {
                "mover_color": "white",
                "phase": "middlegame",
                "cpl": 340,
                "classification": "blunder",
            },
        ],
        "critical_moments": [
            {
                "move_number": 2,
                "move_uci": "g1f3",
                "move_san": "Nf3",
                "mover_color": "white",
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
            "app.services.coach.retrieve_theory",
            return_value=retrieval_result([TheoryEvidence(**theory_result)]),
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
    assert payload["training_plan"]["priority"] == training_plan["priority"]
    assert payload["training_plan"]["week_plan"][:2] == training_plan["week_plan"]
    assert payload["grounding_status"] == "evidence_found"
    assert payload["sources"][0]["citation_id"] == "S1"
    assert payload["sources"][0]["source_id"] == "study-1"
    theory_recommendation = next(
        item
        for item in payload["actionable_recommendations"]
        if item["evidence_type"] == "theory"
    )
    assert theory_recommendation["source_ids"] == ["S1"]
    assert len(payload["game_analyses"]) == 1
    assert payload["game_analyses"][0]["player_color"] == "white"
    assert payload["game_analyses"][0]["opponent"] == "opponent"
    assert payload["game_analyses"][0]["result"] == "win"
    assert payload["game_analyses"][0]["pgn"] == game.pgn
    assert payload["game_analyses"][0]["moves"] == analysis["moves"]
    assert payload["saved"] is False


def test_analyze_pgn_returns_the_same_player_coaching_contract(client):
    pgn = (
        '[Event "Uploaded game"]\n'
        '[White "PGNWhite"]\n'
        '[Black "PGNBlack"]\n'
        '[Result "0-1"]\n\n'
        "1. e4 e5 2. Qh5 Nc6 3. Qxe5+ Nxe5 0-1"
    )
    white_mistake = {
        "move_number": 3,
        "move_uci": "h5e5",
        "move_san": "Qxe5+",
        "mover_color": "white",
        "phase": "opening",
        "evaluation_before": 0.2,
        "evaluation_after": -4.1,
        "cpl": 430,
        "classification": "blunder",
        "fen_before": "white-before",
        "fen_after": "white-after",
    }
    black_mistake = {
        "move_number": 3,
        "move_uci": "c6e5",
        "move_san": "Nxe5",
        "mover_color": "black",
        "phase": "opening",
        "evaluation_before": 4.1,
        "evaluation_after": 2.7,
        "cpl": 140,
        "classification": "mistake",
        "fen_before": "black-before",
        "fen_after": "black-after",
    }
    analysis = {
        "total_moves": 6,
        "summary": {},
        "moves": [
            {
                **white_mistake,
                "move_number": 1,
                "move_uci": "e2e4",
                "move_san": "e4",
                "cpl": 10,
                "classification": "good",
            },
            {
                **black_mistake,
                "move_number": 1,
                "move_uci": "e7e5",
                "move_san": "e5",
                "cpl": 12,
                "classification": "good",
            },
            white_mistake,
            black_mistake,
        ],
        "critical_moments": [white_mistake, black_mistake],
        "phase_weaknesses": ["opening"],
    }
    generated = {
        "coach_advice": "Your opening needs a calmer threat check before recapturing.",
        "priority": "opening calculation",
        "week_plan": ["Replay the critical position from Black's side."],
    }
    analyze_game = AsyncMock(return_value=analysis)

    with (
        patch("app.services.coach.analyze_game", new=analyze_game),
        patch(
            "app.services.coach.retrieve_theory",
            return_value=retrieval_result(),
        ),
        patch(
            "app.services.coach.generate_training_plan",
            new=AsyncMock(return_value=generated),
        ),
    ):
        response = client.post(
            "/coach/analyze-pgn",
            json={"pgn": pgn, "player_color": "black", "depth": 1},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["username"] == "PGNBlack"
    assert payload["games_requested"] == 1
    assert payload["games_analyzed"] == 1
    assert payload["coach_advice"].startswith(generated["coach_advice"])
    assert "No relevant theory source was available" in payload["coach_advice"]
    assert payload["grounding_status"] == "insufficient_evidence"
    assert payload["sources"] == []
    assert all(
        item["evidence_type"] == "game_analysis" and item["source_ids"] == []
        for item in payload["actionable_recommendations"]
    )
    assert len(payload["training_plan"]["week_plan"]) == 5
    assert payload["critical_moments"] == [
        {
            "game_id": payload["game_analyses"][0]["game_id"],
            "move_number": 3,
            "move": "Nxe5",
            "phase": "opening",
            "cpl": 140,
            "classification": "mistake",
        }
    ]
    assert payload["game_analyses"][0]["player_color"] == "black"
    assert payload["game_analyses"][0]["opponent"] == "PGNWhite"
    assert payload["game_analyses"][0]["result"] == "win"
    assert payload["game_analyses"][0]["pgn"] == pgn
    assert payload["game_analyses"][0]["moves"] == analysis["moves"]
    assert payload["saved"] is False
    analyze_game.assert_awaited_once_with(pgn, 1)


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
        "moves": [
            {
                "mover_color": "white",
                "phase": "opening",
                "cpl": 20,
                "classification": "good",
            }
        ],
        "critical_moments": [],
        "phase_weaknesses": [],
    }
    fetch_games = AsyncMock(return_value=[game])
    analyze_game = AsyncMock(return_value=analysis)

    with (
        patch("app.services.coach.fetch_games", new=fetch_games),
        patch("app.services.coach.analyze_game", new=analyze_game),
        patch(
            "app.services.coach.retrieve_theory",
            return_value=retrieval_result(),
        ),
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


@pytest.mark.parametrize("player_color", ["white", "black"])
def test_profile_excludes_opponent_only_blunder_and_keeps_full_game(
    client,
    player_color,
):
    username = "test-user"
    opponent = "opponent"
    white_username = username if player_color == "white" else opponent
    black_username = opponent if player_color == "white" else username
    opponent_color = "black" if player_color == "white" else "white"
    game = Game(
        id=f"{player_color}-game",
        speed="rapid",
        rated=True,
        winner=None,
        status="draw",
        white=Player(username=white_username, rating=1500),
        black=Player(username=black_username, rating=1490),
        moves="e4 e5 Nf3 Nc6",
        pgn='[Event "Test"]\n\n1. e4 e5 2. Nf3 Nc6 *',
    )
    if player_color == "white":
        full_moves = [
            _move("white", "e2e4", 10, phase="opening"),
            _move("black", "e7e5", 420, phase="endgame"),
            _move("white", "g1f3", 20, phase="middlegame"),
            _move("black", "b8c6", 15, phase="endgame"),
        ]
    else:
        full_moves = [
            _move("white", "e2e4", 420, phase="endgame"),
            _move("black", "e7e5", 10, phase="opening"),
            _move("white", "g1f3", 15, phase="endgame"),
            _move("black", "b8c6", 20, phase="middlegame"),
        ]
    opponent_move = next(
        move
        for move in full_moves
        if move["mover_color"] == opponent_color and move["cpl"] == 420
    )
    opponent_blunder = {
        **opponent_move,
        "move_number": 1,
        "move_san": "e5" if opponent_color == "black" else "e4",
    }
    analysis = {
        "total_moves": len(full_moves),
        "summary": {},
        "moves": full_moves,
        "critical_moments": [opponent_blunder],
        "phase_weaknesses": ["opening"],
    }

    response = _analyze_with_fakes(client, game, analysis)

    assert response.status_code == 200
    payload = response.json()
    phase_stats = payload["diagnosis"]["phase_stats"]
    assert phase_stats["opening"] == {
        "moves": 1,
        "avg_cpl": 10.0,
        "inaccuracies": 0,
        "mistakes": 0,
        "blunders": 0,
    }
    assert phase_stats["middlegame"] == {
        "moves": 1,
        "avg_cpl": 20.0,
        "inaccuracies": 0,
        "mistakes": 0,
        "blunders": 0,
    }
    assert phase_stats["endgame"] == {
        "moves": 0,
        "avg_cpl": 0,
        "inaccuracies": 0,
        "mistakes": 0,
        "blunders": 0,
    }
    assert payload["diagnosis"]["main_weakness"] == "middlegame"
    assert payload["diagnosis"]["secondary_weakness"] == "opening"
    assert "missed tactics" not in payload["diagnosis"]["detected_patterns"]
    assert payload["critical_moments"] == []

    full_game = payload["game_analyses"][0]
    assert full_game["player_color"] == player_color
    assert full_game["total_moves"] == len(full_moves)
    assert full_game["moves"] == full_moves
    assert full_game["critical_moments"] == [opponent_blunder]


def test_personal_critical_moments_only_include_the_users_moves(client):
    game = Game(
        id="mixed-errors",
        speed="rapid",
        rated=True,
        winner="black",
        status="mate",
        white=Player(username="test-user", rating=1500),
        black=Player(username="opponent", rating=1490),
        moves="e4 e5",
        pgn='[Event "Test"]\n\n1. e4 e5 *',
    )
    user_blunder = {
        **_move("white", "e2e4", 350),
        "move_number": 1,
        "move_san": "e4",
    }
    opponent_blunder = {
        **_move("black", "e7e5", 500),
        "move_number": 1,
        "move_san": "e5",
    }
    analysis = {
        "total_moves": 2,
        "summary": {},
        "moves": [user_blunder, opponent_blunder],
        "critical_moments": [user_blunder, opponent_blunder],
        "phase_weaknesses": ["opening"],
    }

    response = _analyze_with_fakes(client, game, analysis)

    assert response.status_code == 200
    payload = response.json()
    assert payload["diagnosis"]["phase_stats"]["opening"]["moves"] == 1
    assert payload["diagnosis"]["phase_stats"]["opening"]["blunders"] == 1
    assert payload["critical_moments"] == [
        {
            "game_id": "mixed-errors",
            "move_number": 1,
            "move": "e4",
            "phase": "opening",
            "cpl": 350,
            "classification": "blunder",
        }
    ]
    assert len(payload["game_analyses"][0]["critical_moments"]) == 2


def test_game_without_requested_player_is_not_analyzed(client):
    game = Game(
        id="unrelated-game",
        speed="rapid",
        rated=True,
        winner="white",
        status="mate",
        white=Player(username="other-white"),
        black=Player(username="other-black"),
        moves="e4 e5",
        pgn='[Event "Test"]\n\n1. e4 e5 *',
    )
    analyze_game = AsyncMock()

    with (
        patch(
            "app.services.coach.fetch_games",
            new=AsyncMock(return_value=[game]),
        ),
        patch("app.services.coach.analyze_game", new=analyze_game),
    ):
        response = client.post(
            "/coach/analyze-user",
            json={"username": "test-user", "limit": 1, "depth": 1},
        )

    assert response.status_code == 422
    assert response.json() == {"detail": "No games could be analyzed."}
    analyze_game.assert_not_awaited()


def test_persistence_receives_player_projection_not_full_game():
    game = Game(
        id="saved-game",
        speed="rapid",
        rated=True,
        winner="black",
        status="mate",
        white=Player(username="test-user"),
        black=Player(username="opponent"),
        moves="e4 e5",
        pgn='[Event "Test"]\n\n1. e4 e5 *',
    )
    user_mistake = {
        **_move("white", "e2e4", 120),
        "classification": "mistake",
    }
    opponent_blunder = _move("black", "e7e5", 500)
    full_analysis = {
        "game_id": game.id,
        "total_moves": 2,
        "summary": {},
        "moves": [user_mistake, opponent_blunder],
        "critical_moments": [user_mistake, opponent_blunder],
        "phase_weaknesses": ["opening"],
    }
    player_analysis = project_analysis_for_player(full_analysis, "white")
    analyzed_game = AnalyzedPlayerGame(
        game=game,
        full_analysis=full_analysis,
        player_analysis=player_analysis,
        player_color="white",
    )
    db = MagicMock()
    user = object()
    saved_game_analysis = object()
    saved_weakness = object()

    with (
        patch("app.services.coach.get_or_create_user", return_value=user),
        patch(
            "app.services.coach.save_game_analysis",
            return_value=saved_game_analysis,
        ) as save_game,
        patch("app.services.coach.save_critical_moves") as save_critical,
        patch(
            "app.services.coach.upsert_weakness_profile",
            return_value=saved_weakness,
        ),
        patch("app.services.coach.save_training_recommendation"),
    ):
        persist_coach_result(
            db=db,
            username="test-user",
            analyzed_games=[analyzed_game],
            weakness_profile={"games_analyzed": 1},
            theory_recommendations=[],
            training_plan={"priority": "opening", "week_plan": []},
        )

    assert save_game.call_args.args[3] is player_analysis
    assert save_critical.call_args.args[2] == [user_mistake]
    assert len(full_analysis["critical_moments"]) == 2
    db.commit.assert_called_once_with()
    db.rollback.assert_not_called()


def test_detect_best_phase_uses_only_phases_with_move_evidence():
    phase_stats = {
        "opening": {"moves": 4, "avg_cpl": 12.5},
        "middlegame": {"moves": 3, "avg_cpl": 31.0},
        "endgame": {"moves": 2, "avg_cpl": 48.0},
    }

    assert detect_best_phase(phase_stats) == "opening"


@pytest.mark.parametrize(
    "phase_stats",
    [
        {},
        {
            "opening": {"moves": 0, "avg_cpl": 0},
            "middlegame": {"moves": 0, "avg_cpl": 0},
            "endgame": {"moves": 0, "avg_cpl": 0},
        },
        {
            "opening": {"avg_cpl": 10},
            "middlegame": {"avg_cpl": 20},
        },
    ],
)
def test_detect_best_phase_does_not_invent_strength_without_evidence(
    phase_stats,
):
    assert detect_best_phase(phase_stats) is None


def _move(
    mover_color: str,
    move_uci: str,
    cpl: int,
    phase: str = "opening",
) -> dict:
    return {
        "move_number": 1,
        "move_uci": move_uci,
        "move_san": move_uci,
        "mover_color": mover_color,
        "phase": phase,
        "evaluation_before": 0.0,
        "evaluation_after": -(cpl / 100),
        "cpl": cpl,
        "classification": "blunder" if cpl > 300 else "good",
        "fen_before": "before",
        "fen_after": "after",
    }


def _analyze_with_fakes(client, game: Game, analysis: dict):
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
            "app.services.coach.retrieve_theory",
            return_value=retrieval_result(),
        ),
        patch(
            "app.services.coach.generate_training_plan",
            new=AsyncMock(
                return_value={
                    "priority": "calculation",
                    "week_plan": ["Review the game."],
                }
            ),
        ),
    ):
        return client.post(
            "/coach/analyze-user",
            json={
                "username": "test-user",
                "limit": 1,
                "depth": 1,
                "save": False,
            },
        )
