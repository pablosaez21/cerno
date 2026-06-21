import asyncio
import io
from pathlib import Path

import chess
import chess.engine
import chess.pgn

from app.core.config import settings

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_STOCKFISH_PATH = PROJECT_ROOT / "engines" / "stockfish.exe"
STOCKFISH_PATH = Path(settings.stockfish_path or str(DEFAULT_STOCKFISH_PATH))

PHASES = ("opening", "middlegame", "endgame")
MATE_SCORE = 10000


async def analyze_game(pgn: str, depth: int = 12) -> dict:
    depth = settings.clamp_stockfish_depth(depth)
    return await asyncio.to_thread(_analyze_game_sync, pgn, depth)


def _analyze_game_sync(pgn: str, depth: int) -> dict:
    if not pgn or not pgn.strip():
        raise ValueError("PGN is required.")

    if depth < 1:
        raise ValueError("Depth must be greater than 0.")

    stockfish_path = _resolve_stockfish_path()
    game = chess.pgn.read_game(io.StringIO(pgn))
    if game is None:
        raise ValueError("Invalid PGN.")

    mainline_moves = list(game.mainline_moves())
    if not mainline_moves:
        raise ValueError("Invalid PGN: no moves found.")

    board = game.board()
    moves = []
    critical_moments = []

    try:
        with chess.engine.SimpleEngine.popen_uci(stockfish_path) as engine:
            for move in mainline_moves:
                move_number = board.fullmove_number
                player_turn = board.turn
                phase = get_phase(board)
                fen_before = board.fen()
                move_san = board.san(move)
                evaluation_before = _evaluate_board(engine, board, depth, player_turn)

                board.push(move)

                fen_after = board.fen()
                evaluation_after = _evaluate_board(engine, board, depth, player_turn)
                cpl = calculate_cpl(evaluation_before, evaluation_after)
                classification = classify_move(cpl)

                move_analysis = {
                    "move_number": move_number,
                    "move_uci": move.uci(),
                    "move_san": move_san,
                    "phase": phase,
                    "evaluation_before": evaluation_before,
                    "evaluation_after": evaluation_after,
                    "cpl": cpl,
                    "classification": classification,
                    "fen_before": fen_before,
                    "fen_after": fen_after,
                }
                moves.append(move_analysis)

                if classification != "good":
                    critical_moments.append(move_analysis)
    except chess.engine.EngineError as exc:
        raise RuntimeError("Stockfish failed while analyzing the PGN.") from exc
    except OSError as exc:
        raise RuntimeError("Could not start Stockfish.") from exc

    summary = get_summary(moves)

    return {
        "total_moves": len(moves),
        "summary": summary,
        "critical_moments": critical_moments,
        "phase_weaknesses": detect_phase_weaknesses(summary),
        "moves": moves,
    }


def _resolve_stockfish_path() -> Path:
    path = STOCKFISH_PATH
    if not path.is_absolute():
        path = PROJECT_ROOT / path

    if not path.exists():
        raise FileNotFoundError(f"Stockfish executable not found at {path}.")

    return path


def _evaluate_board(
    engine: chess.engine.SimpleEngine,
    board: chess.Board,
    depth: int,
    pov: chess.Color,
) -> float:
    info = engine.analyse(board, chess.engine.Limit(depth=depth))
    score = info["score"].pov(pov).score(mate_score=MATE_SCORE)
    if score is None:
        return 0.0
    return round(score / 100, 2)


def calculate_cpl(evaluation_before: float, evaluation_after: float) -> int:
    loss = max(0.0, evaluation_before - evaluation_after)
    return int(round(loss * 100))


def classify_move(cpl: int) -> str:
    if cpl > 300:
        return "blunder"
    if cpl > 100:
        return "mistake"
    if cpl > 50:
        return "inaccuracy"
    return "good"


def get_phase(board: chess.Board) -> str:
    pieces = len(board.piece_map())
    if board.fullmove_number <= 10:
        return "opening"
    if pieces <= 12:
        return "endgame"
    return "middlegame"


def get_summary(moves: list[dict]) -> dict:
    summary = {}

    for phase in PHASES:
        phase_moves = [move for move in moves if move["phase"] == phase]
        cpls = [move["cpl"] for move in phase_moves]

        summary[phase] = {
            "avg_cpl": round(sum(cpls) / len(cpls), 1) if cpls else 0,
            "inaccuracies": len([
                move for move in phase_moves
                if move["classification"] == "inaccuracy"
            ]),
            "mistakes": len([
                move for move in phase_moves
                if move["classification"] == "mistake"
            ]),
            "blunders": len([
                move for move in phase_moves
                if move["classification"] == "blunder"
            ]),
        }

    return summary


def detect_phase_weaknesses(summary: dict) -> list[str]:
    phase_scores = []
    for phase, stats in summary.items():
        score = (
            stats["avg_cpl"]
            + stats["inaccuracies"] * 10
            + stats["mistakes"] * 25
            + stats["blunders"] * 60
        )
        if score > 0:
            phase_scores.append((phase, score))

    phase_scores.sort(key=lambda item: item[1], reverse=True)
    return [phase for phase, score in phase_scores if score >= 50]
