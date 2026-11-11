// Game phases.
//  - Endgame: port of scalachess `Divider` (Lichess): the endgame starts at the
//    first position with at most 6 major and minor pieces in total, provided a
//    middlegame was detected before it.
//  - Opening: while the game stays on a known line of the Lichess
//    chess-openings dataset, plus a margin, with a hard cap.
import type { Chess } from "chessops/chess";
import { SquareSet } from "chessops/squareSet";
import { positionFromFen, positionKey } from "./chess";
import book from "./data/openings.json";
import type { PlyRecord } from "./types";

export type Phase = "opening" | "middlegame" | "endgame";

/** Plies after leaving the book that still count as opening. */
export const OPENING_MARGIN_PLIES = 6;
/**
 * The opening lasts at least this long (move 10 for both sides). A blind review
 * of 30 real errors put moves 6 to 9 in the opening when the player left the
 * book early.
 */
export const OPENING_MIN_PLIES = 20;
/** Opening never extends past this ply (move 15 for both sides). */
export const OPENING_CAP_PLIES = 30;

const BOOK = book as unknown as { names: [string, string][]; positions: Record<string, number> };

export interface OpeningInfo {
  eco?: string;
  /** Full name, e.g. "Sicilian Defense: Alapin Variation". */
  name?: string;
  /** Part before the colon, e.g. "Sicilian Defense". Used to group games. */
  family?: string;
  /** Last ply (from the start, consecutive) whose position is in the dataset. 0 if none. */
  bookPlies: number;
}

export function openingOf(plies: Pick<PlyRecord, "fenAfter">[]): OpeningInfo {
  let bookPlies = 0;
  let named: number | undefined;
  for (let i = 0; i < plies.length; i++) {
    const idx = BOOK.positions[positionKey(plies[i].fenAfter)];
    if (idx === undefined) break;
    bookPlies = i + 1;
    if (idx >= 0) named = idx;
  }
  if (named === undefined) return { bookPlies };
  const [eco, name] = BOOK.names[named];
  return { eco, name, family: name.split(":")[0].trim(), bookPlies };
}

/** Last ply that belongs to the opening phase. */
export function openingEndPly(bookPlies: number): number {
  return Math.min(Math.max(bookPlies + OPENING_MARGIN_PLIES, OPENING_MIN_PLIES), OPENING_CAP_PLIES);
}

function majorsAndMinors(pos: Chess): number {
  const b = pos.board;
  return b.occupied.diff(b.king.union(b.pawn)).size();
}

function backrankSparse(pos: Chess): boolean {
  const b = pos.board;
  return b.white.intersect(SquareSet.fromRank(0)).size() < 4 || b.black.intersect(SquareSet.fromRank(7)).size() < 4;
}

function score(y: number, white: number, black: number): number {
  switch (white) {
    case 0:
      switch (black) {
        case 1: return 1 + y;
        case 2: return y < 6 ? 2 + (6 - y) : 0;
        case 3: return y < 7 ? 3 + (7 - y) : 0;
        case 4: return y < 7 ? 3 + (7 - y) : 0;
        default: return 0;
      }
    case 1:
      switch (black) {
        case 0: return 1 + (8 - y);
        case 1: return 5 + Math.abs(4 - y);
        case 2: return 4 + (7 - y);
        case 3: return 5 + (7 - y);
        default: return 0;
      }
    case 2:
      switch (black) {
        case 0: return y > 2 ? 2 + (y - 2) : 0;
        case 1: return 4 + (y - 1);
        case 2: return 7;
        default: return 0;
      }
    case 3:
      switch (black) {
        case 0: return y > 1 ? 3 + (y - 1) : 0;
        case 1: return 5 + (y - 1);
        default: return 0;
      }
    case 4:
      return black === 0 && y > 1 ? 3 + (y - 1) : 0;
    default:
      return 0;
  }
}

export function mixedness(pos: Chess): number {
  let acc = 0;
  for (let y = 0; y <= 6; y++) {
    for (let x = 0; x <= 6; x++) {
      const region = [x + 8 * y, x + 1 + 8 * y, x + 8 * (y + 1), x + 1 + 8 * (y + 1)];
      let w = 0;
      let b = 0;
      for (const sq of region) {
        if (pos.board.white.has(sq)) w++;
        else if (pos.board.black.has(sq)) b++;
      }
      acc += score(y + 1, w, b);
    }
  }
  return acc;
}

/**
 * Index (0 = start position, i = after ply i) where the endgame begins, or
 * undefined. Mirrors `Divider.apply`.
 */
export function endgameStart(fens: string[]): number | undefined {
  let mid: number | undefined;
  for (let i = 0; i < fens.length; i++) {
    const pos = positionFromFen(fens[i]);
    if (mid === undefined && (majorsAndMinors(pos) <= 10 || backrankSparse(pos) || mixedness(pos) > 150)) mid = i;
    if (mid !== undefined && majorsAndMinors(pos) <= 6) return i;
  }
  return undefined;
}

/** Phase of each ply, judged on the position before the move. */
export function phasesOf(startFen: string, plies: PlyRecord[], bookPlies: number): Phase[] {
  const fens = [startFen, ...plies.map((p) => p.fenAfter)];
  const end = endgameStart(fens);
  const openingEnd = openingEndPly(bookPlies);
  return plies.map((p) => {
    if (end !== undefined && p.ply - 1 >= end) return "endgame";
    if (p.ply <= openingEnd) return "opening";
    return "middlegame";
  });
}

export type EndgameType = "pawn" | "rook" | "minor" | "queen" | "rook_minor" | "mixed";

/** Endgame type from the non-pawn material left on the board (both sides). */
export function endgameType(fen: string): EndgameType {
  const b = positionFromFen(fen).board;
  const rooks = b.rook.nonEmpty();
  const minors = b.knight.union(b.bishop).nonEmpty();
  const queens = b.queen.nonEmpty();
  if (!rooks && !minors && !queens) return "pawn";
  if (queens) return !rooks && !minors ? "queen" : "mixed";
  if (rooks && minors) return "rook_minor";
  return rooks ? "rook" : "minor";
}
