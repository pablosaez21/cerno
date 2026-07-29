from __future__ import annotations

import asyncio
import math
from collections.abc import Callable
from pathlib import Path

import chess
import pytest

from app.services.stockfish import PHASES, analyze_game
from app.services.weakness import project_analysis_for_player

pytestmark = [pytest.mark.integration, pytest.mark.stockfish, pytest.mark.slow]

CLASSIFICATIONS = {"good", "inaccuracy", "mistake", "blunder"}


def run_analysis(pgn: str, stockfish_binary: Path) -> dict:
    return asyncio.run(
        analyze_game(
            pgn,
            depth=1,
            stockfish_path=stockfish_binary,
        )
    )


def assert_stable_move_contract(result: dict) -> None:
    assert result["total_moves"] == len(result["moves"])
    for move in result["moves"]:
        board_before = chess.Board(move["fen_before"])
        board_after = chess.Board(move["fen_after"])

        assert move["mover_color"] == (
            "white" if board_before.turn == chess.WHITE else "black"
        )
        assert board_before.fen() == move["fen_before"]
        assert board_after.fen() == move["fen_after"]
        assert move["cpl"] >= 0
        assert move["phase"] in PHASES
        assert move["classification"] in CLASSIFICATIONS
        assert math.isfinite(move["evaluation_before"])
        assert math.isfinite(move["evaluation_after"])


def test_real_stockfish_analyzes_full_game_and_both_player_projections(
    stockfish_binary: Path,
    load_pgn: Callable[[str], str],
) -> None:
    result = run_analysis(load_pgn("normal.pgn"), stockfish_binary)

    assert result["total_moves"] == 4
    assert [move["mover_color"] for move in result["moves"]] == [
        "white",
        "black",
        "white",
        "black",
    ]
    assert_stable_move_contract(result)

    result["game_id"] = "normal"
    white_projection = project_analysis_for_player(result, "white")
    black_projection = project_analysis_for_player(result, "black")
    assert {move["mover_color"] for move in white_projection["moves"]} == {"white"}
    assert {move["mover_color"] for move in black_projection["moves"]} == {"black"}
    assert len(white_projection["moves"]) == 2
    assert len(black_projection["moves"]) == 2
    assert len(result["moves"]) == 4


@pytest.mark.parametrize(
    ("fixture_name", "expected_plies", "expected_uci"),
    [
        ("castling.pgn", 7, "e1g1"),
        ("en_passant.pgn", 5, "e5d6"),
        ("promotion.pgn", 1, "a7a8q"),
        ("mate.pgn", 4, "d8h4"),
        ("custom_fen.pgn", 1, "e2f3"),
    ],
)
def test_real_stockfish_handles_special_positions(
    fixture_name: str,
    expected_plies: int,
    expected_uci: str,
    stockfish_binary: Path,
    load_pgn: Callable[[str], str],
) -> None:
    result = run_analysis(load_pgn(fixture_name), stockfish_binary)

    assert result["total_moves"] == expected_plies
    assert expected_uci in {move["move_uci"] for move in result["moves"]}
    assert_stable_move_contract(result)

    if fixture_name == "mate.pgn":
        assert chess.Board(result["moves"][-1]["fen_after"]).is_checkmate()
    if fixture_name == "custom_fen.pgn":
        expected_fen = chess.Board("8/8/8/8/8/8/4K3/6k1 w - - 0 1").fen()
        assert result["moves"][0]["fen_before"] == expected_fen


def test_invalid_pgn_returns_controlled_error(
    stockfish_binary: Path,
    load_pgn: Callable[[str], str],
) -> None:
    with pytest.raises(ValueError, match="Invalid PGN"):
        run_analysis(load_pgn("invalid.pgn"), stockfish_binary)


def test_missing_stockfish_binary_returns_clear_error(
    tmp_path: Path,
    load_pgn: Callable[[str], str],
) -> None:
    missing_binary = tmp_path / "missing-stockfish"

    with pytest.raises(
        FileNotFoundError,
        match="Stockfish executable not found",
    ):
        run_analysis(load_pgn("normal.pgn"), missing_binary)
