import pytest

from app.services.weakness import (
    aggregate_game_analyses,
    project_analysis_for_player,
)


def test_aggregation_detects_main_weakness_and_builds_queries():
    analyses = [
        {
            "moves": [
                {"phase": "opening", "cpl": 20, "classification": "good"},
                {"phase": "middlegame", "cpl": 180, "classification": "mistake"},
                {"phase": "middlegame", "cpl": 360, "classification": "blunder"},
                {"phase": "endgame", "cpl": 30, "classification": "good"},
            ],
            "critical_moments": [
                {
                    "phase": "middlegame",
                    "cpl": 360,
                    "classification": "blunder",
                }
            ],
        }
    ]

    profile = aggregate_game_analyses(analyses)

    assert profile["main_weakness"] == "middlegame"
    assert "missed tactics" in profile["detected_patterns"]
    assert "middlegame tactics for beginners" in profile["theory_queries"]
    assert "king safety principles" in profile["theory_queries"]


def test_player_projection_drives_exact_aggregate_stats_without_mutating_full_game():
    white_good = {
        "mover_color": "white",
        "phase": "opening",
        "cpl": 20,
        "classification": "good",
    }
    black_blunder = {
        "mover_color": "black",
        "phase": "opening",
        "cpl": 400,
        "classification": "blunder",
    }
    white_mistake = {
        "mover_color": "white",
        "phase": "opening",
        "cpl": 120,
        "classification": "mistake",
    }
    full_analysis = {
        "total_moves": 3,
        "moves": [white_good, black_blunder, white_mistake],
        "critical_moments": [black_blunder, white_mistake],
    }

    player_analysis = project_analysis_for_player(full_analysis, "white")
    profile = aggregate_game_analyses([player_analysis])

    assert player_analysis["moves"] == [white_good, white_mistake]
    assert player_analysis["critical_moments"] == [white_mistake]
    assert profile["phase_stats"]["opening"] == {
        "moves": 2,
        "avg_cpl": 70.0,
        "inaccuracies": 0,
        "mistakes": 1,
        "blunders": 0,
    }
    assert "opening principles development center king safety" in profile[
        "theory_queries"
    ]
    assert len(full_analysis["moves"]) == 3
    assert full_analysis["critical_moments"] == [black_blunder, white_mistake]


def test_player_projection_rejects_moves_without_ownership():
    analysis = {
        "moves": [
            {
                "phase": "opening",
                "cpl": 20,
                "classification": "good",
            }
        ],
        "critical_moments": [],
    }

    with pytest.raises(
        ValueError,
        match="Every analyzed move must include a valid mover_color",
    ):
        project_analysis_for_player(analysis, "white")
