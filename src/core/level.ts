// Level metrics: how the player's move compares with what players of their
// level do in the same position, according to Maia-3. Pure functions; the
// engine and the model run elsewhere.
//
// Maia-3 describes a population (Lichess blitz players of a given Elo), not
// the player. It does not see the clock and was trained without moves made
// with less than 30 s, so those moves are out of scope.
import { rankedMoves, type MaiaPrediction } from "./maia";
import type { TimeClass } from "./types";
import { THRESHOLDS } from "./winprob";

/** Moves made with less than this on the clock are out of Maia-3's scope. */
export const MAIA_MIN_CLOCK = 30;

/**
 * Lichess Elo fed to Maia = Chess.com rating + offset. Measured on the 96 blitz
 * games of the reference player: the offset that makes the opponents' real moves
 * (30 s or more) most likely is +360, 95% bootstrap interval [+313, +399], at a
 * mean Chess.com rating of 1453 (scripts/maia/fit.ts, analyze-fit.ts).
 * Valid around that rating; other ratings may need another offset.
 */
export const CHESSCOM_TO_LICHESS_OFFSET = 360;

/** Candidate moves are evaluated until they cover this much probability... */
export const CANDIDATE_COVERAGE = 0.9;
/** ...or this many moves. */
export const CANDIDATE_MAX = 6;

/**
 * Level thresholds on pGood, chosen with the calibration on opponents' moves
 * (scripts/maia/calibrate.ts). PROVISIONAL until that measurement is written in REPORT.md.
 */
export const LEVEL_THRESHOLDS = { belowLevel: 0.7, hard: 0.3 } as const;

export type LevelTag = "below_level" | "hard";
export type OutOfScope = "clock" | "time_class" | "no_rating" | "no_model";

export interface PeerMetrics {
  /** Maia model id. */
  model: string;
  /** Lichess Elo used for the player and the opponent. */
  eloSelf: number;
  eloOppo: number;
  /** Probability that a Lichess player of eloSelf plays the move played. */
  pPlayed: number;
  /** Probability that such a player plays a move losing less than the inaccuracy threshold. */
  pGood: number;
  /** Probability mass of moves not evaluated by the engine (unknown if good). */
  pUnevaluated: number;
  level?: LevelTag;
  /** loss x pGood: the part of the loss that players of that level avoid. */
  avoidableLoss: number;
}

export function eloForMaia(chesscomOrLichess: number | undefined, source: "chesscom" | "lichess" | "pgn"): number | undefined {
  if (chesscomOrLichess === undefined) return undefined;
  return source === "chesscom" ? chesscomOrLichess + CHESSCOM_TO_LICHESS_OFFSET : chesscomOrLichess;
}

export function outOfScope(input: { clockBefore?: number; timeClass: TimeClass; ratingKnown: boolean }): OutOfScope | undefined {
  if (input.timeClass !== "blitz") return "time_class";
  if (!input.ratingKnown) return "no_rating";
  if (input.clockBefore !== undefined && input.clockBefore < MAIA_MIN_CLOCK) return "clock";
  return undefined;
}

/**
 * Most likely Maia moves whose loss is not known yet, until the known plus the
 * returned moves cover CANDIDATE_COVERAGE of the probability or CANDIDATE_MAX moves.
 */
export function candidatesToEvaluate(pred: MaiaPrediction, known: ReadonlySet<string>): string[] {
  const out: string[] = [];
  let covered = 0;
  let count = 0;
  for (const { uci, p } of rankedMoves(pred)) {
    if (covered >= CANDIDATE_COVERAGE || count >= CANDIDATE_MAX) break;
    covered += p;
    count++;
    if (!known.has(uci)) out.push(uci);
  }
  return out;
}

/** pGood and pUnevaluated from the move losses known for this position. */
export function goodMass(pred: MaiaPrediction, losses: ReadonlyMap<string, number>, threshold = THRESHOLDS.inaccuracy): { pGood: number; pUnevaluated: number } {
  let pGood = 0;
  let pUnevaluated = 0;
  for (const [uci, p] of Object.entries(pred.policy)) {
    const loss = losses.get(uci);
    if (loss === undefined) pUnevaluated += p;
    else if (loss < threshold) pGood += p;
  }
  return { pGood, pUnevaluated };
}

export function levelTag(pGood: number): LevelTag | undefined {
  if (pGood >= LEVEL_THRESHOLDS.belowLevel) return "below_level";
  if (pGood <= LEVEL_THRESHOLDS.hard) return "hard";
  return undefined;
}

export function peerMetrics(input: {
  model: string;
  pred: MaiaPrediction;
  losses: ReadonlyMap<string, number>;
  played: string;
  loss: number;
  eloSelf: number;
  eloOppo: number;
}): PeerMetrics {
  const { pGood, pUnevaluated } = goodMass(input.pred, input.losses);
  return {
    model: input.model,
    eloSelf: input.eloSelf,
    eloOppo: input.eloOppo,
    pPlayed: input.pred.policy[input.played] ?? 0,
    pGood,
    pUnevaluated,
    level: levelTag(pGood),
    avoidableLoss: input.loss * pGood,
  };
}

/** Expected loss of a player of that level in a position: sum of p(move) x loss(move) over evaluated moves. */
export function expectedLoss(pred: MaiaPrediction, losses: ReadonlyMap<string, number>): { expected: number; coverage: number } {
  let e = 0;
  let coverage = 0;
  for (const [uci, p] of Object.entries(pred.policy)) {
    const loss = losses.get(uci);
    if (loss === undefined) continue;
    e += p * loss;
    coverage += p;
  }
  // Normalised over the evaluated mass: the unevaluated moves are the unlikely ones.
  return { expected: coverage ? e / coverage : 0, coverage };
}

