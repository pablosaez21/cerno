"""Builds the Maia3 parity reference with the official code (CSSLab/maia3).

Usage: python make_reference.py <maia3-repo> <checkpoint.pt> <games.json> <out.json>
games.json: a list of objects with a "pgn" field (Chess.com archive format).

For each case it stores the history FENs (oldest first, up to 8), the Elos, the
board strings the official tokenizer sees (after mirroring), the legal move
indices in the official vocabulary, and the model's top moves and WDL, so the
TypeScript encoder and the browser model can be checked without the network.
"""
import io, json, random, sys, types
import chess, chess.pgn, torch

sys.path.insert(0, sys.argv[1])
from maia3.dataset import tokenize_board, get_historical_tokens, get_legal_moves_mask
from maia3.models import MAIA3Model
from maia3.model_registry import MODEL_SPECS
from maia3.utils import get_all_possible_moves

random.seed(7)
spec = next(s for s in MODEL_SPECS if s.name == "maia3-5m")
cfg = types.SimpleNamespace(**spec.config)
model = MAIA3Model(cfg)
sd = torch.load(sys.argv[2], map_location="cpu", weights_only=True)
sd = sd.get("model_state_dict", sd)
model.load_state_dict({k.replace("smolgen", "gab"): v for k, v in sd.items()}, strict=True)
model.eval()
moves = get_all_possible_moves()
move_idx = {m: i for i, m in enumerate(moves)}

def board_string(t):  # (64, 12) one-hot -> 64 chars, a1..h8
    out = []
    for sq in range(64):
        nz = (t[sq] > 0).nonzero().flatten().tolist()
        out.append("." if not nz else "PNBRQKpnbrqk"[nz[0]])
    return "".join(out)

def case(history_boards, elo_self, elo_oppo, label):
    hist = [tokenize_board(b) for b in history_boards][-8:]
    from collections import deque
    tokens = get_historical_tokens(deque(hist), cfg, 0, 0, 0, 0)[:, : 12 * cfg.history]
    board = history_boards[-1]
    mask = get_legal_moves_mask(board, move_idx)
    with torch.no_grad():
        lm, lv, _ = model(tokens.unsqueeze(0), torch.tensor([elo_self]), torch.tensor([elo_oppo]))
    logits = lm[0].masked_fill(~mask, float("-inf"))
    probs = torch.softmax(logits, -1)
    top = torch.topk(probs, 5)
    wdl = torch.softmax(lv[0], -1).tolist()
    legal = {}
    for mv in board.legal_moves:
        u = mv.uci() if board.turn == chess.WHITE else "".join(
            [mv.uci()[0], str(9 - int(mv.uci()[1])), mv.uci()[2], str(9 - int(mv.uci()[3])), mv.uci()[4:]])
        legal[mv.uci()] = move_idx[u]
    return {
        "label": label,
        "fens": [b.fen() for b in history_boards[-8:]],
        "eloSelf": elo_self,
        "eloOppo": elo_oppo,
        "boards": [board_string(tokens[:, 12 * i: 12 * (i + 1)]) for i in range(cfg.history)],
        "legal": legal,
        "top": [[moves[i], round(p, 6)] for p, i in zip(top.values.tolist(), top.indices.tolist())],
        "wdlSideToMove": [round(x, 6) for x in wdl],  # [loss, draw, win] of the side to move
    }

cases = []
games = json.load(open(sys.argv[3]))
for g in games:
    game = chess.pgn.read_game(io.StringIO(g["pgn"]))
    boards = [game.board()]
    for mv in game.mainline_moves():
        b = boards[-1].copy(); b.push(mv); boards.append(b)
    for _ in range(2):
        i = random.randrange(0, len(boards) - 1)
        cases.append(case(boards[max(0, i - 7): i + 1], random.choice([600, 1100, 1500, 1900, 2400]), random.choice([800, 1500, 2000]), "game"))

def from_moves(start_fen, sans, label):
    b = chess.Board(start_fen); bs = [b.copy()]
    for s in sans:
        b.push_san(s); bs.append(b.copy())
    cases.append(case(bs, 1500, 1500, label))

from_moves(chess.STARTING_FEN, [], "start, short history")
from_moves(chess.STARTING_FEN, ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6"], "white can castle short")
from_moves("r3k2r/pppq1ppp/2n1bn2/3pp3/3PP3/2N1BN2/PPPQ1PPP/R3K2R b KQkq - 4 8", [], "black can castle both sides")
from_moves("8/1P4k1/8/8/8/8/6K1/8 w - - 0 1", [], "white promotion")
from_moves("8/6K1/8/8/8/8/1p4k1/8 b - - 0 1", [], "black promotion")
from_moves("1n6/P5k1/8/8/8/8/6K1/8 w - - 0 1", [], "promotion with capture")
from_moves("rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3", [], "white en passant")
from_moves("rnbqkbnr/pppp1ppp/8/8/3Pp3/4P3/PPP2PPP/RNBQKBNR b KQkq d3 0 3", [], "black en passant")
from_moves(chess.STARTING_FEN, ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Be7", "e3", "O-O", "Nf3", "h6"], "full 8-position history")
json.dump({"model": "maia3-5m", "cases": cases}, open(sys.argv[4], "w"))
print(len(cases), "cases")
