// Thin helpers over chessops: FEN <-> position, standard UCI, material.
import { Chess, normalizeMove } from "chessops/chess";
import { makeFen, parseFen } from "chessops/fen";
import { makeSan } from "chessops/san";
import type { Move, NormalMove, Role } from "chessops/types";
import { makeSquare, parseUci, squareFile } from "chessops/util";
import type { Color } from "./types";

export function positionFromFen(fen: string): Chess {
  return Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
}

export function fenOf(pos: Chess): string {
  return makeFen(pos.toSetup());
}

/** FEN without move counters: identifies a position for caching and repetition. */
export function positionKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

/** chessops encodes castling as king-takes-rook. Convert to e1g1 style. */
export function toStdUci(pos: Chess, move: Move): string {
  const m = move as NormalMove;
  const piece = pos.board.get(m.from);
  const target = pos.board.get(m.to);
  if (piece?.role === "king" && target?.role === "rook" && target.color === piece.color) {
    const toFile = squareFile(m.to) > squareFile(m.from) ? 6 : 2;
    const rank = Math.floor(m.from / 8);
    return makeSquare(m.from) + makeSquare(rank * 8 + toFile);
  }
  return makeSquare(m.from) + makeSquare(m.to) + (m.promotion ? roleChar(m.promotion) : "");
}

function roleChar(role: Role): string {
  return { pawn: "p", knight: "n", bishop: "b", rook: "r", queen: "q", king: "k" }[role];
}

/** Parse a standard UCI move in `pos`; returns undefined when illegal. */
export function parseStdUci(pos: Chess, uci: string): Move | undefined {
  const parsed = parseUci(uci);
  if (!parsed) return undefined;
  const move = normalizeMove(pos, parsed);
  return pos.isLegal(move) ? move : undefined;
}

export function sanOf(fen: string, uci: string): string | undefined {
  const pos = positionFromFen(fen);
  const move = parseStdUci(pos, uci);
  return move ? makeSan(pos, move) : undefined;
}

/** Plays a UCI line from `fen`, stopping at the first illegal move. */
export function playLine(fen: string, ucis: string[]): { positions: Chess[]; moves: Move[] } {
  const pos = positionFromFen(fen);
  const positions: Chess[] = [pos.clone()];
  const moves: Move[] = [];
  for (const uci of ucis) {
    const move = parseStdUci(pos, uci);
    if (!move) break;
    pos.play(move);
    moves.push(move);
    positions.push(pos.clone());
  }
  return { positions, moves };
}

export const PIECE_VALUE: Record<Role, number> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
  king: 0,
};

/** Material of `color` minus material of the opponent, in pawns. */
export function materialBalance(pos: Chess, color: Color): number {
  let total = 0;
  for (const [, piece] of pos.board) {
    const v = PIECE_VALUE[piece.role];
    total += piece.color === color ? v : -v;
  }
  return total;
}

export function opposite(color: Color): Color {
  return color === "white" ? "black" : "white";
}
