from app.services.weakness import aggregate_game_analyses


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
