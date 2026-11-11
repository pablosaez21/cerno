// PGN -> list of plies with FENs, standard UCI and clocks.
import { parseComment, parsePgn, startingPosition } from "chessops/pgn";
import { parseSan } from "chessops/san";
import { fenOf, toStdUci } from "./chess";
import type { GameRecord, PlyRecord } from "./types";

export interface ParsedGame {
  startFen: string;
  plies: PlyRecord[];
}

export function parseGameMoves(record: Pick<GameRecord, "pgn" | "timeControl">): ParsedGame {
  const [game] = parsePgn(record.pgn);
  if (!game) throw new Error("PGN sin partida");
  const pos = startingPosition(game.headers).unwrap();
  const startFen = fenOf(pos);
  const plies: PlyRecord[] = [];
  const increment = record.timeControl?.increment ?? 0;
  const base = record.timeControl?.base;
  // Last known clock per colour, starting at the base time.
  const lastClock: Record<string, number | undefined> = { white: base, black: base };
  let ply = 0;
  for (const node of game.moves.mainline()) {
    const move = parseSan(pos, node.san);
    if (!move) break; // Illegal or unparsable SAN: stop at the last valid move.
    const color = pos.turn;
    const fenBefore = fenOf(pos);
    const uci = toStdUci(pos, move);
    const moveNumber = pos.fullmoves;
    pos.play(move);
    ply += 1;
    let clockAfter: number | undefined;
    for (const c of node.comments ?? []) {
      const parsed = parseComment(c);
      if (parsed.clock !== undefined) clockAfter = parsed.clock;
    }
    let timeSpent: number | undefined;
    const prev = lastClock[color];
    if (clockAfter !== undefined && prev !== undefined) {
      timeSpent = Math.max(0, prev - clockAfter + increment);
    }
    if (clockAfter !== undefined) lastClock[color] = clockAfter;
    plies.push({
      ply,
      moveNumber,
      color,
      san: node.san,
      uci,
      fenBefore,
      fenAfter: fenOf(pos),
      clockAfter,
      timeSpent,
    });
  }
  return { startFen, plies };
}
