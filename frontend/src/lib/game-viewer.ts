import { Chess } from "chess.js";
import type { PgnMove } from "@/lib/types";

export type Orientation = "white" | "black";

export type MoveRow = {
  moveNumber: number;
  white?: { move: PgnMove; ply: number };
  black?: { move: PgnMove; ply: number };
};

export function buildPositions(moves: PgnMove[], sourcePgn: string): string[] {
  const reconstructed = reconstructPositions(sourcePgn);
  let current = validFen(moves[0]?.fen_before)
    ? moves[0].fen_before
    : reconstructed[0] ?? "start";
  const positions = [current];

  moves.forEach((move, index) => {
    current = validFen(move.fen_after)
      ? move.fen_after
      : reconstructed[index + 1] ?? current;
    positions.push(current);
  });

  return positions;
}

export function reconstructPositions(pgn: string): string[] {
  if (!pgn.trim()) return [];

  try {
    const game = new Chess();
    game.loadPgn(pgn);
    const history = game.history({ verbose: true });
    if (!history.length) return [];
    return [history[0].before, ...history.map((move) => move.after)];
  } catch {
    return [];
  }
}

export function readPgnMetadata(pgn: string): {
  event?: string;
  white?: string;
  black?: string;
  orientation: Orientation;
} {
  try {
    const game = new Chess();
    game.loadPgn(pgn);
    const headers = game.getHeaders();
    const orientation =
      headers.Orientation?.toLowerCase() === "black" ? "black" : "white";
    return {
      event: headers.Event,
      white: headers.White,
      black: headers.Black,
      orientation,
    };
  } catch {
    return { orientation: "white" };
  }
}

export function validFen(fen: string | undefined): fen is string {
  if (!fen) return false;

  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}

export function groupMoves(moves: PgnMove[]): MoveRow[] {
  const rows = new Map<number, MoveRow>();

  moves.forEach((move, index) => {
    const row = rows.get(move.move_number) ?? {
      moveNumber: move.move_number,
    };
    row[move.mover_color] = { move, ply: index + 1 };
    rows.set(move.move_number, row);
  });

  return Array.from(rows.values());
}

export function findCriticalPly(
  moves: PgnMove[],
  critical: PgnMove | undefined,
): number | null {
  if (!critical) return null;

  const index = moves.findIndex(
    (move) =>
      move.move_uci === critical.move_uci &&
      move.move_number === critical.move_number &&
      move.fen_after === critical.fen_after,
  );
  return index >= 0 ? index + 1 : null;
}

export function getPlayedSquares(
  move: PgnMove | undefined,
): { from: string; to: string } | null {
  if (!move || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move.move_uci)) {
    return null;
  }

  return {
    from: move.move_uci.slice(0, 2),
    to: move.move_uci.slice(2, 4),
  };
}
