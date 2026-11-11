// Tactical evidence for one player move, computed only from engine lines.
// Ideas follow the Lichess puzzle tagger (lichess-puzzler, tagger/cook.py);
// this is an independent reimplementation, not a copy.
import { attacks } from "chessops/attacks";
import type { Chess } from "chessops/chess";
import type { Move, NormalMove, Piece, Square } from "chessops/types";
import { squareRank } from "chessops/util";
import { fenOf, materialBalance, opposite, parseStdUci, PIECE_VALUE, playLine, positionFromFen } from "./chess";
import type { Color, Score } from "./types";

/**
 * Plies of each engine line inspected for material swings: five moves per side,
 * the usual length of a puzzle. Measured on 100 real games: 8 plies left every
 * middlegame error untagged; 16 tags 22% of them but is no longer short term.
 */
export const TACTIC_HORIZON = 10;
/** A forced mate counts as short-term tactics up to this many moves. */
export const SHORT_MATE = 5;
/**
 * Net material (pawns) that makes a swing tactical. A pawn won or lost by a
 * forced sequence counts: on a blind review of 30 real errors, 5 of 16
 * disagreements were one-pawn tactics that a threshold of 2 left as strategy.
 */
export const MATERIAL_SWING = 1;
/** Extra plies followed past the horizon while an exchange is still going on. */
const EXCHANGE_TAIL = 4;

export type TacticTag =
  | "hanging_piece" // the move leaves a piece en prise and the opponent takes it
  | "missed_capture" // a free capture was available and not played
  | "missed_mate" // a short forced mate was available
  | "allowed_mate" // the move allows a short forced mate
  | "missed_tactic" // material could be won by force, not by a simple capture
  | "allowed_tactic"; // the move allows the opponent to win material by force

export type Motif = "fork" | "back_rank_mate";

export interface TacticEvidence {
  tag: TacticTag;
  motifs: Motif[];
  /** Material swing in pawns within the horizon (positive). */
  material?: number;
  /** Mate distance in moves, for mate tags. */
  mateIn?: number;
  /** The engine line that proves it: best line for "missed", refutation for "allowed". */
  line: string[];
}

export interface TacticInput {
  fenBefore: string;
  played: string;
  color: Color;
  /** Best line from the position before the move. */
  bestLine: string[];
  bestScore: Score;
  /** Opponent's best line from the position after the move. */
  refutation: string[];
  afterScore: Score;
}

function isCapture(pos: Chess, move: Move): boolean {
  const m = move as NormalMove;
  const target = pos.board.get(m.to);
  if (target && target.color !== pos.turn && target.role !== "king") return true;
  // En passant
  return pos.board.get(m.from)?.role === "pawn" && pos.epSquare === m.to;
}

/**
 * Material balance for `color` once the line settles: the last position within
 * the horizon that is not in the middle of a capture sequence.
 */
export function settledBalance(fen: string, line: string[], color: Color, horizon = TACTIC_HORIZON): { balance: number; plies: number } {
  const { positions, moves } = playLine(fen, line.slice(0, horizon + EXCHANGE_TAIL));
  // Follow the line to the horizon, then on through any exchange in progress.
  let j = Math.min(horizon, moves.length);
  while (j < moves.length && j < horizon + EXCHANGE_TAIL && isCapture(positions[j], moves[j])) j++;
  // Still mid-exchange (or the line stopped there): step back to a quiet point.
  while (j > 0 && j < moves.length && isCapture(positions[j], moves[j])) j--;
  return { balance: materialBalance(positions[j], color), plies: j };
}

function mateFor(score: Score, color: Color): number | undefined {
  if (!("mate" in score)) return undefined;
  const winner: Color = score.mate > 0 ? "white" : "black";
  return winner === color ? Math.abs(score.mate) : undefined;
}

/** Squares from which `color` attacks `sq`. */
export function attackersOf(pos: Chess, sq: Square, color: Color, occupied = pos.board.occupied): Square[] {
  const out: Square[] = [];
  for (const s of pos.board[color]) {
    const piece = pos.board.get(s)!;
    if (!occupied.has(s)) continue;
    if (attacks(piece, s, occupied).has(sq)) out.push(s);
  }
  return out;
}

/** Defended directly, or through an x-ray behind an attacking slider (Lichess `is_defended`). */
export function isDefended(pos: Chess, sq: Square, piece: Piece): boolean {
  if (attackersOf(pos, sq, piece.color).length) return true;
  for (const a of attackersOf(pos, sq, opposite(piece.color))) {
    const role = pos.board.get(a)!.role;
    if (role === "queen" || role === "rook" || role === "bishop") {
      if (attackersOf(pos, sq, piece.color, pos.board.occupied.without(a)).length) return true;
    }
  }
  return false;
}

const KING_VALUE: Record<string, number> = { ...PIECE_VALUE, king: 99 };

function canBeTakenByLower(pos: Chess, sq: Square, piece: Piece): boolean {
  return attackersOf(pos, sq, opposite(piece.color)).some((a) => {
    const r = pos.board.get(a)!.role;
    return r !== "king" && PIECE_VALUE[r] < PIECE_VALUE[piece.role];
  });
}

function inBadSpot(pos: Chess, sq: Square): boolean {
  const piece = pos.board.get(sq)!;
  return attackersOf(pos, sq, opposite(piece.color)).length > 0 && (!isDefended(pos, sq, piece) || canBeTakenByLower(pos, sq, piece));
}

/**
 * Fork: a move by `side` after which the moved piece, safe on its square,
 * attacks two or more enemy non-pawn pieces that are worth more than it or
 * are undefended. Checks the first three moves of `side` in the line.
 */
export function findFork(fen: string, line: string[], side: Color): boolean {
  const { positions, moves } = playLine(fen, line.slice(0, TACTIC_HORIZON));
  let seen = 0;
  for (let j = 0; j < moves.length && seen < 3; j++) {
    if (positions[j].turn !== side) continue;
    seen++;
    const after = positions[j + 1];
    const to = (moves[j] as NormalMove).to;
    const mover = after.board.get(to);
    if (!mover || inBadSpot(after, to)) continue;
    let targets = 0;
    for (const t of attacks(mover, to, after.board.occupied)) {
      const victim = after.board.get(t);
      if (!victim || victim.color === side || victim.role === "pawn") continue;
      if (KING_VALUE[victim.role] > KING_VALUE[mover.role] || !isDefended(after, t, victim)) targets++;
    }
    if (targets >= 2) return true;
  }
  return false;
}

/** Mate on the back rank with the king boxed in by its own pieces. */
export function isBackRankMate(fen: string, line: string[]): boolean {
  const { positions } = playLine(fen, line);
  const end = positions[positions.length - 1];
  if (!end.isCheckmate()) return false;
  const loser = end.turn;
  const king = end.board.kingOf(loser);
  if (king === undefined) return false;
  const backRank = loser === "white" ? 0 : 7;
  if (squareRank(king) !== backRank) return false;
  const dir = loser === "white" ? 8 : -8;
  const file = king % 8;
  const front = [king + dir];
  if (file > 0) front.push(king + dir - 1);
  if (file < 7) front.push(king + dir + 1);
  return front.every((sq) => {
    const p = end.board.get(sq);
    return p && p.color === loser && attackersOf(end, sq, opposite(loser)).length === 0;
  });
}

export function tacticEvidence(input: TacticInput): TacticEvidence | undefined {
  const { fenBefore, played, color, bestLine, bestScore, refutation, afterScore } = input;
  const opp = opposite(color);
  const pos = positionFromFen(fenBefore);
  const before = materialBalance(pos, color);
  const playedLine = [played, ...refutation];

  // Mates first: they are the clearest evidence.
  const allowedMate = mateFor(afterScore, opp);
  const bestMateAgainst = mateFor(bestScore, opp);
  if (allowedMate !== undefined && allowedMate <= SHORT_MATE && bestMateAgainst === undefined) {
    const motifs: Motif[] = isBackRankMate(fenBefore, playedLine) ? ["back_rank_mate"] : [];
    return { tag: "allowed_mate", motifs, mateIn: allowedMate, line: refutation };
  }
  const missedMate = mateFor(bestScore, color);
  if (missedMate !== undefined && missedMate <= SHORT_MATE && mateFor(afterScore, color) === undefined) {
    const motifs: Motif[] = isBackRankMate(fenBefore, bestLine) ? ["back_rank_mate"] : [];
    return { tag: "missed_mate", motifs, mateIn: missedMate, line: bestLine };
  }

  const gBest = settledBalance(fenBefore, bestLine, color).balance - before;
  const gPlayed = settledBalance(fenBefore, playedLine, color, TACTIC_HORIZON + 1).balance - before;

  const afterPos = playLine(fenBefore, [played]).positions.at(-1)!;
  const hanging = isHangingCapture(afterPos, refutation[0], played, pos);
  // A piece left en prise and taken at once is evidence on its own, even if
  // the best line also loses material later on.
  if (hanging && gPlayed <= -2) return { tag: "hanging_piece", motifs: [], material: -gPlayed, line: refutation };
  if (gPlayed <= -MATERIAL_SWING && gBest - gPlayed >= MATERIAL_SWING) {
    const tag: TacticTag = hanging ? "hanging_piece" : "allowed_tactic";
    const motifs: Motif[] = tag === "allowed_tactic" && findFork(fenOf(afterPos), refutation, opp) ? ["fork"] : [];
    return { tag, motifs, material: -gPlayed, line: refutation };
  }
  if (gBest >= MATERIAL_SWING && gBest - gPlayed >= MATERIAL_SWING) {
    const tag: TacticTag = isFreeCapture(pos, bestLine[0]) ? "missed_capture" : "missed_tactic";
    const motifs: Motif[] = tag === "missed_tactic" && findFork(fenBefore, bestLine, color) ? ["fork"] : [];
    return { tag, motifs, material: gBest, line: bestLine };
  }
  return undefined;
}

/**
 * The opponent's first reply captures a non-pawn piece that the move left
 * undefended (and it is not simply recapturing in a trade the player started).
 */
function isHangingCapture(afterPos: Chess, reply: string | undefined, played: string, beforePos: Chess): boolean {
  if (!reply) return false;
  const mv = parseStdUci(afterPos, reply) as NormalMove | undefined;
  if (!mv) return false;
  const victim = afterPos.board.get(mv.to);
  if (!victim || victim.role === "pawn" || victim.color === afterPos.turn) return false;
  if (isDefended(afterPos, mv.to, victim)) return false;
  // Trade: the player just captured something at least as valuable on that square.
  const pm = parseStdUci(beforePos, played) as NormalMove | undefined;
  const taken = pm ? beforePos.board.get(pm.to) : undefined;
  if (pm && taken && pm.to === mv.to && PIECE_VALUE[taken.role] >= PIECE_VALUE[victim.role]) return false;
  return true;
}

/** The best move captures an undefended piece, or a piece worth more than the capturer. */
function isFreeCapture(pos: Chess, best: string | undefined): boolean {
  if (!best) return false;
  const mv = parseStdUci(pos, best) as NormalMove | undefined;
  if (!mv) return false;
  const victim = pos.board.get(mv.to);
  const capturer = pos.board.get(mv.from);
  if (!victim || !capturer || victim.color === pos.turn) return false;
  return !isDefended(pos, mv.to, victim) || PIECE_VALUE[victim.role] > PIECE_VALUE[capturer.role];
}
