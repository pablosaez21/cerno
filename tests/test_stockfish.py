from pathlib import Path
from unittest.mock import MagicMock, patch

from app.services.stockfish import _analyze_game_sync


def test_analysis_marks_every_ply_with_its_mover_color():
    engine_context = MagicMock()
    engine_context.__enter__.return_value = object()

    with (
        patch(
            "app.services.stockfish._resolve_stockfish_path",
            return_value=Path("stockfish"),
        ),
        patch(
            "app.services.stockfish.chess.engine.SimpleEngine.popen_uci",
            return_value=engine_context,
        ),
        patch(
            "app.services.stockfish._evaluate_board",
            side_effect=[0.0, 0.0, 4.0, 0.0, 0.0, 0.0],
        ),
    ):
        result = _analyze_game_sync(
            '[Event "Test"]\n\n1. e4 e5 2. Nf3 *',
            depth=1,
        )

    assert result["total_moves"] == 3
    assert [move["mover_color"] for move in result["moves"]] == [
        "white",
        "black",
        "white",
    ]
    assert result["critical_moments"][0]["mover_color"] == "black"
