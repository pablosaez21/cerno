// Peer profile, data layer: one decision record per move of BOTH sides.
// Maia-3 gives, at five Elo levels, how Lichess blitz players would choose in
// the position; Stockfish (pass-1 budget) gives how good each candidate move is.
// Pure functions only; orchestration lives in peer-analysis.ts.
//
// Design and measurements: the planner's pilot on the reference player's 96 blitz
// games (6,353 moves of both sides) and on 16 external Lichess players.
import { parseStdUci, positionFromFen } from "./chess";
import type { MaiaPrediction } from "./maia";
import type { Phase } from "./phase";
import type { StyleAttr } from "./style";
import type { Color } from "./types";
import { THRESHOLDS } from "./winprob";

/** Elo levels (added to the mover's Elo only) at which Maia-3 is queried. */
export const PEER_ELO_DELTAS = [-400, -200, 0, 200, 400] as const;
export const DELTA_ZERO = 2;
/**
 * Candidate set: per level, Maia's moves in decreasing probability until 80% of
 * the probability or 4 moves, united over levels, plus the engine's best move.
 * 0.8/4 costs 2.12 searches per decision against 3.54 for 0.9/6 and leaves the
 * overall gap and its SD unchanged within noise (pilot: -71 vs -84, SD 41 vs 35).
 */
export const PEER_COVERAGE = 0.8;
export const PEER_MAX_MOVES = 4;

/** Quality categories of a move: good, inaccuracy, mistake, blunder; 4 = "tail" (outside the candidate set). */
export type QualityCat = 0 | 1 | 2 | 3 | 4;
export const TAIL: QualityCat = 4;
export type Demand = "forcing" | "pawn" | "piece";

export interface Decision {
  gameId: string;
  ply: number;
  mover: "player" | "opponent";
  color: Color;
  moveNumber: number;
  phase: Phase;
  clockBefore?: number;
  timeSpent?: number;
  /** Maia-3 scope for per-move statistics: clock unknown or >= 30 s. */
  inScope: boolean;
  /** Mover's and other side's Elo on Maia's (Lichess) scale. */
  elo: number;
  eloOpp: number;
  fen: string;
  played: string;
  engineBest: string;
  /** Candidate set S (never depends on the move played), then the played move if outside S. */
  moves: string[];
  inSet: boolean[];
  /** p[level][i]: Maia probability of moves[i] at PEER_ELO_DELTAS[level]. */
  p: number[][];
  /** mass[level]: Maia probability of the whole set S at that level. */
  mass: number[];
  /** Mover's win % after each move (pass-1 budget). */
  win: number[];
  /** Mover's win % of the position (pass-1 eval). */
  winPosition: number;
  // ---- derived by finishDecision
  winRef: number;
  loss: number[];
  cat: QualityCat[];
  /** Category of the played move, TAIL when it is outside S. */
  observed: QualityCat;
  /** Pass-1 loss of the played move. */
  playedLoss: number;
  /** Quality log-likelihood per level. */
  lq: number[];
  /** Style log-likelihood per level (within quality); 0 for tail moves. */
  ls: number[];
  demand: Demand;
  /** Exactly one good move in S and S has at least 3 moves. */
  oneGood: boolean;
  /** Style attributes of the move played and their expectation under Maia (step 8). */
  attr?: StyleAttr;
}

/** Moves in decreasing probability (stable on ties: order of first appearance). */
function ranked(policy: Record<string, number>): [string, number][] {
  return Object.entries(policy).sort((a, b) => b[1] - a[1]);
}

/** S: union over levels of the top moves to PEER_COVERAGE or PEER_MAX_MOVES, plus the engine best. */
export function candidateSet(levels: MaiaPrediction[], engineBest: string | undefined, coverage = PEER_COVERAGE, maxMoves = PEER_MAX_MOVES): string[] {
  const out: string[] = [];
  for (const pred of levels) {
    let cov = 0;
    let n = 0;
    for (const [uci, p] of ranked(pred.policy)) {
      if (cov >= coverage || n >= maxMoves) break;
      cov += p;
      n++;
      if (!out.includes(uci)) out.push(uci);
    }
  }
  if (engineBest && !out.includes(engineBest)) out.push(engineBest);
  return out;
}

export function categoryOf(loss: number): 0 | 1 | 2 | 3 {
  if (loss < THRESHOLDS.inaccuracy) return 0;
  if (loss < THRESHOLDS.mistake) return 1;
  if (loss < THRESHOLDS.blunder) return 2;
  return 3;
}

/** Demand of a position: what kind of move the engine's best is. */
export function demandOf(fen: string, best: string): Demand {
  const pos = positionFromFen(fen);
  const mv = parseStdUci(pos, best) as { from: number; to: number } | undefined;
  if (!mv) return "piece";
  const mover = pos.board.get(mv.from);
  const target = pos.board.get(mv.to);
  const ep = mover?.role === "pawn" && pos.epSquare === mv.to;
  const capture = (!!target && target.color !== pos.turn) || ep;
  const after = pos.clone();
  after.play(mv as never);
  if (capture || after.isCheck()) return "forcing";
  return mover?.role === "pawn" ? "pawn" : "piece";
}

const LOG_FLOOR_TAIL = 1e-6;
const LOG_FLOOR = 1e-9;

/** Input of finishDecision: the raw record before derived fields. */
export type RawDecision = Omit<Decision, "winRef" | "loss" | "cat" | "observed" | "playedLoss" | "lq" | "ls" | "demand" | "oneGood">;

export function finishDecision(raw: RawDecision): Decision {
  const n = raw.moves.length;
  let winRef = -Infinity;
  for (let i = 0; i < n; i++) if (raw.inSet[i]) winRef = Math.max(winRef, raw.win[i]);
  const loss = raw.win.map((w) => Math.max(0, winRef - w));
  const cat = loss.map(categoryOf) as QualityCat[];
  const ip = raw.moves.indexOf(raw.played);
  const playedIn = raw.inSet[ip];
  const observed: QualityCat = playedIn ? cat[ip] : TAIL;
  const lq = raw.p.map((pd, d) => {
    if (!playedIn) return Math.log(Math.max(1 - raw.mass[d], LOG_FLOOR_TAIL));
    let s = 0;
    for (let i = 0; i < n; i++) if (raw.inSet[i] && cat[i] === cat[ip]) s += pd[i];
    return Math.log(Math.max(s, LOG_FLOOR));
  });
  const ls = raw.p.map((pd, d) => (playedIn ? Math.log(Math.max(pd[ip], LOG_FLOOR)) - lq[d] : 0));
  let good = 0;
  let size = 0;
  for (let i = 0; i < n; i++) {
    if (!raw.inSet[i]) continue;
    size++;
    if (cat[i] === 0) good++;
  }
  return {
    ...raw,
    winRef,
    loss,
    cat,
    observed,
    playedLoss: loss[ip],
    lq,
    ls,
    demand: demandOf(raw.fen, raw.engineBest),
    oneGood: good === 1 && size >= 3,
  };
}

/** Category probabilities pi[level][cat] (cats 0-3 and tail). */
export function categoryProbs(d: Decision): number[][] {
  return d.p.map((pd, level) => {
    const pi = [0, 0, 0, 0, Math.max(1 - d.mass[level], LOG_FLOOR_TAIL)];
    pd.forEach((p, i) => {
      if (d.inSet[i]) pi[d.cat[i]] += p;
    });
    return pi;
  });
}
