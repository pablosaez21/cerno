import chess
import chess.pgn
import chess.engine
import io
from pathlib import Path

STOCKFISH_PATH = Path("engines/stockfish.exe")

async def analyze_game(pgn: str, depth: int = 15) -> dict:
    game = chess.pgn.read_game(io.StringIO(pgn))
    if not game:
        return {"error": "PGN inválido"}

    board = game.board()
    moves_analysis = []
    prev_score = None

    with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
        for move in game.mainline_moves():
            board.push(move)
            info = engine.analyse(board, chess.engine.Limit(depth=depth))
            score = info["score"].white().score(mate_score=10000)

            cpl = None
            if prev_score is not None and score is not None:
                cpl = abs(prev_score - score)

            moves_analysis.append({
                "move": move.uci(),
                "score": score,
                "cpl": cpl,
                "phase": get_phase(board)
            })

            prev_score = score

    return {
        "total_moves": len(moves_analysis),
        "moves": moves_analysis,
        "summary": get_summary(moves_analysis)
    }

def get_phase(board: chess.Board) -> str:
    pieces = len(board.piece_map())
    if board.fullmove_number <= 10:
        return "opening"
    elif pieces <= 12:
        return "endgame"
    else:
        return "middlegame"

def get_summary(moves: list) -> dict:
    phases = {"opening": [], "middlegame": [], "endgame": []}

    for move in moves:
        if move["cpl"] is not None:
            phases[move["phase"]].append(move["cpl"])

    summary = {}
    for phase, cpls in phases.items():
        if cpls:
            summary[phase] = {
                "avg_cpl": round(sum(cpls) / len(cpls), 1),
                "blunders": len([c for c in cpls if c > 300]),
                "mistakes": len([c for c in cpls if 100 < c <= 300]),
                "inaccuracies": len([c for c in cpls if 50 < c <= 100])
            }
        else:
            summary[phase] = None

    return summary